import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import Value from 'typebox/value';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import type { WebSocket } from 'ws';
import { getRow } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import {
  COLLAB_FRAME_AWARENESS, COLLAB_FRAME_SYNC, decodeFrame, encodeFrame, parseCollabDocKey, rewriteAwarenessUpdate,
} from '@dude/collab-doc';
import type { CollabDocKind, CollabFrameKind } from '@dude/collab-doc';
import {
  COLLAB_COLOR_SLOTS, COLLAB_MAX_CHANNELS, COLLAB_MAX_CONTROL_BYTES, COLLAB_MAX_FRAME_BYTES, COLLAB_RATE_LIMIT_FRAMES, COLLAB_RATE_LIMIT_WINDOW_MS,
  CollabClientControl, HUB_COLLAB_PATH, HUB_MIN_CLIENT_PROTOCOL, HUB_PROTOCOL_VERSION, REALTIME_CLOSE_CODES, REALTIME_HEARTBEAT_INTERVAL_MS,
  REALTIME_HELLO_TIMEOUT_MS, REALTIME_IDLE_TIMEOUT_MS, checkProtocolCompatibility,
} from '@dude/contracts/hub';
import type { CollabDocErrorCode, CollabIdentity, CollabServerControl } from '@dude/contracts/hub';
import type { HubEventMap } from '../auth/hub-events.js';
import { getCanonicalRecord } from '../db/canonical-repository.js';
import { getAuthorityState } from '../hub/authority.js';
import type { HostGuard } from '../security/host-guard.js';
import { envelope } from '../server/errors.js';
import { authenticateUpgrade } from '../realtime/ws-auth.js';
import type { WsPrincipal } from '../realtime/ws-auth.js';
import { collabCategory, principalConsents } from './collab-consent.js';
import type { CollabDocHandle, CollabPrincipal, CollabRegistry } from './doc-registry.js';
import type { CollabRooms } from './rooms.js';

export interface CollabSocketTimings {
  helloTimeoutMs: number;
  idleTimeoutMs: number;
  heartbeatIntervalMs: number;
  /** How often the credential, the transfer state and every subscription's consent are re-checked. */
  revalidateIntervalMs: number;
  /** Frames (control and binary) allowed per window per connection. */
  rateLimit: { max: number; windowMs: number };
}

export const DEFAULT_COLLAB_SOCKET_TIMINGS: CollabSocketTimings = {
  helloTimeoutMs: REALTIME_HELLO_TIMEOUT_MS,
  idleTimeoutMs: REALTIME_IDLE_TIMEOUT_MS,
  heartbeatIntervalMs: REALTIME_HEARTBEAT_INTERVAL_MS,
  revalidateIntervalMs: 60_000,
  rateLimit: { max: COLLAB_RATE_LIMIT_FRAMES, windowMs: COLLAB_RATE_LIMIT_WINDOW_MS },
};

export interface CollabSocketOptions {
  db: Db;
  now: () => number;
  hostGuard: HostGuard;
  registry: CollabRegistry;
  rooms: CollabRooms;
  timings?: Partial<CollabSocketTimings>;
}

export interface CollabSocketHub {
  /** Open collaboration sockets. */
  connectionCount(): number;
  /** Subscriptions currently open on `docKey` across every socket. */
  subscriberCount(docKey: string): number;
  /** Closes every collaboration socket with `code` (a transferred Hub closes them with 4004, PD-071). */
  closeAll(code: number, reason?: string): void;
}

declare module 'fastify' {
  interface FastifyInstance { collabSockets: CollabSocketHub }
}

/** Awareness client ids one subscription may control (a browser tab uses one; the cap only bounds a hostile client). */
const MAX_CONTROLLED_AWARENESS_IDS = 8;
/** A socket whose outgoing queue passes this is closed (1013, try again later) instead of buffering without bound. */
const MAX_BUFFERED_BYTES = COLLAB_MAX_FRAME_BYTES * 8;
/** The credential is re-checked at most this often while frames flow; push events and the revalidate timer cover the rest. */
const VALIDITY_RECHECK_MS = 1000;

const DOC_ERROR_MESSAGES: Record<CollabDocErrorCode, string> = {
  'consent-required': 'Collaboration on this document needs its sync category enabled.',
  'not-found': 'No such document.',
  forbidden: 'This credential cannot open this document.',
  'too-large': 'The change would make the document larger than the record limit.',
  limit: 'A collaboration limit was reached.',
  unavailable: 'The document is no longer available.',
  'consent-revoked': 'Collaboration on this document was turned off.',
};

interface Connection {
  socket: WebSocket;
  principal: WsPrincipal;
  helloed: boolean;
  identity: CollabIdentity | null;
  editor: CollabPrincipal;
  subs: Map<number, Sub>;
  /** Channels the Hub ended (consent revoked, document gone): frames still in flight for them are dropped, not protocol errors. */
  ended: Set<number>;
  timers: Array<NodeJS.Timeout>;
  idle: NodeJS.Timeout | undefined;
  recent: number[];
  validatedAt: number;
}

/** Everything the Hub keeps per open document key: the shared awareness and who is subscribed. */
interface DocChannel {
  readonly docKey: string;
  readonly awareness: Awareness;
  readonly subs: Set<Sub>;
  /** Awareness client ids and the subscription that owns each: one subscription can never overwrite another's presence. */
  readonly owners: Map<number, Sub>;
}

interface Sub {
  readonly conn: Connection;
  readonly channel: number;
  readonly docKey: string;
  readonly kind: CollabDocKind;
  readonly source: CollabDocHandle;
  readonly docChannel: DocChannel;
  readonly controlled: Set<number>;
  stops: Array<() => void>;
  torn: boolean;
}

const hash8 = (value: string): number => createHash('sha256').update(value).digest()[0]! % COLLAB_COLOR_SLOTS;

/** The varUint client ids an awareness update carries (it has already been re-encoded by `rewriteAwarenessUpdate`). */
function awarenessClientIds(update: Uint8Array): number[] | null {
  try {
    const decoder = decoding.createDecoder(update);
    const count = decoding.readVarUint(decoder);
    const ids: number[] = [];
    for (let i = 0; i < count; i += 1) {
      ids.push(decoding.readVarUint(decoder));
      decoding.readVarUint(decoder);
      decoding.readVarString(decoder);
    }
    return ids;
  } catch {
    return null;
  }
}

/**
 * The collaboration WebSocket (PD-100). Same credential classes, hello/welcome and close codes as the realtime socket;
 * JSON control frames next to binary `[channel][kind][y-protocols payload]` frames:
 * - kind 0 (sync): the y-protocols sync message (`[syncStep1 | syncStep2 | update][payload]`), exactly what `writeSyncStep1`,
 *   `writeSyncStep2` and `writeUpdate` produce into a fresh encoder.
 * - kind 1 (awareness): a y-protocols awareness update (`encodeAwarenessUpdate`).
 * Client sync writes go through the document handle (record cap, editor attribution, persistence); the Hub rewrites the identity
 * of every awareness entry from the authenticated principal. Awareness is held in Hub memory only (PD-108). Needs `registerWsHost`
 * first.
 */
export function registerCollabSocket(app: FastifyInstance, options: CollabSocketOptions): CollabSocketHub {
  const { db, registry, rooms } = options;
  const timings: CollabSocketTimings = { ...DEFAULT_COLLAB_SOCKET_TIMINGS, ...options.timings };
  const connections = new Set<Connection>();
  const channels = new Map<string, DocChannel>();
  const principals = new WeakMap<FastifyRequest, WsPrincipal>();

  const hub: CollabSocketHub = {
    connectionCount: () => connections.size,
    subscriberCount: (docKey) => channels.get(docKey)?.subs.size ?? 0,
    closeAll: (code, reason = '') => {
      for (const conn of [...connections]) close(conn, code, reason);
    },
  };
  app.decorate('collabSockets', hub);

  const sendControl = (conn: Connection, message: CollabServerControl): void => {
    if (conn.socket.readyState === conn.socket.OPEN) conn.socket.send(JSON.stringify(message));
  };
  const sendDocError = (conn: Connection, channel: number, code: CollabDocErrorCode): void =>
    sendControl(conn, { type: 'doc-error', channel, code, message: DOC_ERROR_MESSAGES[code] });
  const sendFrame = (sub: Sub, kind: CollabFrameKind, payload: Uint8Array): void => {
    const { socket } = sub.conn;
    if (socket.readyState !== socket.OPEN) return;
    if (socket.bufferedAmount > MAX_BUFFERED_BYTES) { close(sub.conn, 1013, 'slow consumer'); return; }
    try { socket.send(encodeFrame(sub.channel, kind, payload), { binary: true }); } catch { close(sub.conn, 1011, 'send failed'); }
  };
  const close = (conn: Connection, code: number, reason = ''): void => {
    if (conn.socket.readyState === conn.socket.OPEN || conn.socket.readyState === conn.socket.CONNECTING) conn.socket.close(code, reason);
  };

  const browserOfSession = (sessionHash: string | null): string | null =>
    sessionHash === null ? null
      : getRow<{ browser_device_id: string | null }>(db.prepare('SELECT browser_device_id FROM sessions WHERE session_hash = ?'), sessionHash)?.browser_device_id ?? null;

  /** The registry row this socket edits as (a device, a bound owner-bearer's device, or a cookie session's browser row) and the stamped identity. */
  function resolveIdentity(principal: WsPrincipal): { identity: CollabIdentity; editor: CollabPrincipal } {
    const rowId = principal.deviceId ?? (principal.kind === 'owner-cookie' ? browserOfSession(principal.sessionHash) : principal.boundDeviceId);
    const name = rowId === null ? undefined : getRow<{ display_name: string }>(db.prepare('SELECT display_name FROM devices WHERE device_id = ?'), rowId)?.display_name;
    // A session without a registry row (a cookie browser that never attached) still needs a stable, non-credential id.
    const deviceId = rowId ?? `session-${createHash('sha256').update(principal.sessionHash ?? 'none').digest('hex').slice(0, 16)}`;
    return {
      identity: { deviceId: deviceId.slice(0, 64), name: (name?.trim() ? name.trim() : 'Owner').slice(0, 64), colorSlot: hash8(deviceId) },
      editor: { deviceId: rowId },
    };
  }

  const environmentId = (): string | undefined => getRow<{ environment_id: string }>(db.prepare('SELECT environment_id FROM environment LIMIT 1'))?.environment_id;

  /** Teardown of one subscription: stop listeners, drop its presence, release the document. Idempotent. */
  function teardown(sub: Sub): void {
    if (sub.torn) return;
    sub.torn = true;
    for (const stop of sub.stops) stop();
    sub.stops = [];
    const { docChannel } = sub;
    docChannel.subs.delete(sub);
    if (sub.conn.subs.get(sub.channel) === sub) sub.conn.subs.delete(sub.channel);
    if (sub.controlled.size > 0) removeAwarenessStates(docChannel.awareness, [...sub.controlled], 'disconnect');
    sub.controlled.clear();
    sub.source.release();
    if (docChannel.subs.size === 0) {
      docChannel.awareness.destroy();
      if (channels.get(sub.docKey) === docChannel) channels.delete(sub.docKey);
    }
  }

  /** The Hub ends a subscription (consent revoked, document evicted): tell the client and remember the channel so late frames are ignored. */
  function endSub(sub: Sub, code: CollabDocErrorCode): void {
    const { conn, channel } = sub;
    teardown(sub);
    conn.ended.add(channel);
    sendDocError(conn, channel, code);
  }

  function teardownConnection(conn: Connection): void {
    for (const sub of [...conn.subs.values()]) teardown(sub);
    conn.ended.clear();
  }

  function channelFor(docKey: string, doc: CollabDocHandle['doc']): DocChannel {
    const existing = channels.get(docKey);
    if (existing) return existing;
    const awareness = new Awareness(doc);
    // The Hub itself never has a presence; `new Awareness` starts one for its own client id.
    awareness.setLocalState(null);
    const docChannel: DocChannel = { docKey, awareness, subs: new Set(), owners: new Map() };
    awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      const owner = docChannel.subs.has(origin as Sub) ? (origin as Sub) : undefined;
      for (const id of added.concat(updated)) {
        if (owner) { owner.controlled.add(id); docChannel.owners.set(id, owner); }
      }
      for (const id of removed) {
        docChannel.owners.get(id)?.controlled.delete(id);
        docChannel.owners.delete(id);
      }
      const payload = encodeAwarenessUpdate(awareness, added.concat(updated, removed));
      for (const sub of docChannel.subs) if (sub !== origin) sendFrame(sub, COLLAB_FRAME_AWARENESS, payload);
    });
    channels.set(docKey, docChannel);
    return docChannel;
  }

  type Access = 'ok' | CollabDocErrorCode;
  /** Authorization of a persisted document: the principal belongs to this Hub's environment, has consented, and the record exists (scratchpad may still be unsynced). */
  function checkAccess(conn: Connection, kind: Exclude<CollabDocKind, 'room'>, id: string): Access {
    const env = environmentId();
    if (env === undefined) return 'forbidden';
    const { principal } = conn;
    const deviceId = principal.deviceId;
    if (deviceId !== null) {
      const row = getRow<{ environment_id: string }>(db.prepare('SELECT environment_id FROM devices WHERE device_id = ?'), deviceId);
      if (row?.environment_id !== env) return 'forbidden';
    }
    const category = collabCategory(kind);
    if (category === null || !principalConsents(db, principal, category)) return 'consent-required';
    if (kind !== 'scratchpad') {
      const record = getCanonicalRecord(db, env, kind, id);
      if (record === undefined || record.deleted) return 'not-found';
    }
    return 'ok';
  }

  function subscribe(conn: Connection, channel: number, docKey: string): void {
    conn.ended.delete(channel);
    if (conn.subs.has(channel)) { sendDocError(conn, channel, 'limit'); return; }
    if (conn.subs.size >= COLLAB_MAX_CHANNELS) { sendDocError(conn, channel, 'limit'); return; }
    for (const existing of conn.subs.values()) if (existing.docKey === docKey) { sendDocError(conn, channel, 'limit'); return; }
    const ref = parseCollabDocKey(docKey);
    if (!ref) { sendDocError(conn, channel, 'not-found'); return; }

    let source: CollabDocHandle;
    if (ref.kind === 'room') {
      const joined = rooms.join(ref.id);
      if (!joined.ok) { sendDocError(conn, channel, joined.code); return; }
      source = joined.handle;
    } else {
      const access = checkAccess(conn, ref.kind, ref.id);
      if (access !== 'ok') { sendDocError(conn, channel, access); return; }
      try {
        source = registry.open(docKey, conn.editor);
      } catch {
        sendDocError(conn, channel, 'unavailable');
        return;
      }
    }

    const docChannel = channelFor(docKey, source.doc);
    const sub: Sub = { conn, channel, docKey, kind: ref.kind, source, docChannel, controlled: new Set(), stops: [], torn: false };
    conn.subs.set(channel, sub);
    docChannel.subs.add(sub);
    // Updates reach every other handle on the document; this handle's own writes are not echoed back.
    sub.stops.push(source.onUpdate((update, origin) => {
      if (origin === source) return;
      const encoder = encoding.createEncoder();
      syncProtocol.writeUpdate(encoder, update);
      sendFrame(sub, COLLAB_FRAME_SYNC, encoding.toUint8Array(encoder));
    }));
    sub.stops.push(source.onClosed(() => endSub(sub, 'unavailable')));

    sendControl(conn, { type: 'subscribed', channel, doc: docKey });
    const step1 = encoding.createEncoder();
    syncProtocol.writeSyncStep1(step1, source.doc);
    sendFrame(sub, COLLAB_FRAME_SYNC, encoding.toUint8Array(step1));
    const present = [...docChannel.awareness.getStates().keys()];
    if (present.length > 0) sendFrame(sub, COLLAB_FRAME_AWARENESS, encodeAwarenessUpdate(docChannel.awareness, present));
  }

  function handleSync(sub: Sub, payload: Uint8Array): boolean {
    const decoder = decoding.createDecoder(payload);
    const type = decoding.readVarUint(decoder);
    if (type === syncProtocol.messageYjsSyncStep1) {
      const reply = encoding.createEncoder();
      syncProtocol.readSyncStep1(decoder, reply, sub.source.doc);
      if (decoding.hasContent(decoder)) return false;
      sendFrame(sub, COLLAB_FRAME_SYNC, encoding.toUint8Array(reply));
      return true;
    }
    if (type !== syncProtocol.messageYjsSyncStep2 && type !== syncProtocol.messageYjsUpdate) return false;
    const update = decoding.readVarUint8Array(decoder);
    if (decoding.hasContent(decoder)) return false;
    const result = sub.source.apply(update, sub.conn.editor);
    if (result.ok) return true;
    if (result.code === 'too-large') sendDocError(sub.conn, sub.channel, 'too-large');
    else endSub(sub, 'unavailable');
    return true;
  }

  function handleAwareness(sub: Sub, payload: Uint8Array): void {
    const identity = sub.conn.identity;
    if (identity === null) return;
    const rewritten = rewriteAwarenessUpdate(payload, identity);
    if (rewritten === null) return;
    const ids = awarenessClientIds(rewritten);
    if (ids === null) return;
    const { awareness, owners } = sub.docChannel;
    let fresh = 0;
    for (const id of ids) {
      if (id === awareness.clientID) return;
      const owner = owners.get(id);
      if (owner !== undefined && owner !== sub) return;
      if (!sub.controlled.has(id)) fresh += 1;
    }
    if (sub.controlled.size + fresh > MAX_CONTROLLED_AWARENESS_IDS) return;
    applyAwarenessUpdate(awareness, rewritten, sub);
  }

  // --- Consent and credential events ---------------------------------------------------------------------------------

  /** Ends every persisted-document subscription of the matching sockets whose principal no longer consents (PD-103). */
  const recheckConsent = (matches: (conn: Connection) => boolean): void => {
    for (const conn of [...connections]) {
      if (!conn.helloed || !matches(conn)) continue;
      for (const sub of [...conn.subs.values()]) {
        const category = collabCategory(sub.kind);
        if (category !== null && !principalConsents(db, conn.principal, category)) endSub(sub, 'consent-revoked');
      }
    }
  };
  const onWebAccessChanged = (): void => recheckConsent((c) => c.principal.kind === 'owner-cookie');
  const onSyncStateChanged = (data: HubEventMap['device-sync-state-changed'][0]): void =>
    recheckConsent((c) => c.principal.deviceId === data.deviceId || c.principal.boundDeviceId === data.deviceId);
  const onSessionRevoked = (data: HubEventMap['session-revoked'][0]): void => {
    for (const conn of [...connections].filter((c) => c.principal.sessionHash === data.sessionHash)) close(conn, REALTIME_CLOSE_CODES.revoked, 'session revoked');
  };
  const onDeviceGone = (data: HubEventMap['device-revoked'][0]): void => {
    for (const conn of [...connections].filter((c) => c.principal.deviceId === data.deviceId || c.principal.boundDeviceId === data.deviceId)) {
      close(conn, REALTIME_CLOSE_CODES.revoked, 'device revoked');
    }
  };
  app.hubEvents.on('web-access-changed', onWebAccessChanged);
  app.hubEvents.on('device-sync-state-changed', onSyncStateChanged);
  app.hubEvents.on('session-revoked', onSessionRevoked);
  app.hubEvents.on('device-revoked', onDeviceGone);
  app.hubEvents.on('device-unenrolled', onDeviceGone);

  app.addHook('preClose', async () => {
    for (const conn of [...connections]) close(conn, 1001, 'server shutting down');
    for (const conn of [...connections]) {
      for (const t of conn.timers) clearInterval(t);
      if (conn.idle) clearTimeout(conn.idle);
      teardownConnection(conn);
    }
  });
  app.addHook('onClose', async () => {
    app.hubEvents.off('web-access-changed', onWebAccessChanged);
    app.hubEvents.off('device-sync-state-changed', onSyncStateChanged);
    app.hubEvents.off('session-revoked', onSessionRevoked);
    app.hubEvents.off('device-revoked', onDeviceGone);
    app.hubEvents.off('device-unenrolled', onDeviceGone);
    rooms.dispose();
  });

  // --- Connections ---------------------------------------------------------------------------------------------------

  const authHook = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | undefined> => {
    const principal = authenticateUpgrade(request, options, 'collab');
    if (!principal) return reply.code(401).type('application/json').header('Cache-Control', 'no-store').send(envelope('unauthorized', 'Authentication is required.'));
    principals.set(request, principal);
    return undefined;
  };

  function handleConnection(socket: WebSocket, principal: WsPrincipal): void {
    const conn: Connection = {
      socket, principal, helloed: false, identity: null, editor: { deviceId: null }, subs: new Map(), ended: new Set(),
      timers: [], idle: undefined, recent: [], validatedAt: options.now(),
    };
    connections.add(conn);

    const armIdle = (ms: number, code: number): void => {
      if (conn.idle) clearTimeout(conn.idle);
      conn.idle = setTimeout(() => close(conn, code, 'timeout'), ms);
    };
    armIdle(timings.helloTimeoutMs, REALTIME_CLOSE_CODES.protocolError);

    const revalidate = setInterval(() => {
      if (getAuthorityState(db) === 'transferred') { close(conn, REALTIME_CLOSE_CODES.transferred, 'hub transferred'); return; }
      if (!principal.stillValid(options.now())) { close(conn, REALTIME_CLOSE_CODES.unauthorized, 'credential no longer valid'); return; }
      recheckConsent((c) => c === conn);
    }, timings.revalidateIntervalMs);
    revalidate.unref();
    conn.timers.push(revalidate);

    socket.on('close', () => {
      connections.delete(conn);
      for (const t of conn.timers) clearInterval(t);
      if (conn.idle) clearTimeout(conn.idle);
      teardownConnection(conn);
    });
    socket.on('error', () => { /* the close handler cleans up */ });

    const protocolError = (): void => close(conn, REALTIME_CLOSE_CODES.protocolError, 'invalid message');

    socket.on('message', (data: Buffer, isBinary: boolean) => {
      // A socket that survived the transfer (or opened in the instant before it) answers nothing, not even a welcome (PD-071).
      if (getAuthorityState(db) === 'transferred') { close(conn, REALTIME_CLOSE_CODES.transferred, 'hub transferred'); return; }
      const at = options.now();
      const cutoff = at - timings.rateLimit.windowMs;
      conn.recent = conn.recent.filter((t) => t > cutoff);
      conn.recent.push(at);
      if (conn.recent.length > timings.rateLimit.max) { close(conn, REALTIME_CLOSE_CODES.rateLimited, 'rate limited'); return; }
      if (at - conn.validatedAt >= VALIDITY_RECHECK_MS || !isBinary) {
        if (!principal.stillValid(at)) { close(conn, REALTIME_CLOSE_CODES.unauthorized, 'credential no longer valid'); return; }
        conn.validatedAt = at;
      }

      if (isBinary) {
        if (!conn.helloed || data.length > COLLAB_MAX_FRAME_BYTES) { protocolError(); return; }
        armIdle(timings.idleTimeoutMs, REALTIME_CLOSE_CODES.heartbeatTimeout);
        const frame = decodeFrame(data);
        if (frame === null) { protocolError(); return; }
        const sub = conn.subs.get(frame.channel);
        if (sub === undefined) {
          if (conn.ended.has(frame.channel)) return;
          protocolError();
          return;
        }
        try {
          if (frame.kind === COLLAB_FRAME_SYNC) { if (!handleSync(sub, frame.payload)) protocolError(); }
          else handleAwareness(sub, frame.payload);
        } catch {
          // A malformed Yjs update or sync message: Yjs changed nothing; the connection is not trusted any further.
          protocolError();
        }
        return;
      }

      if (data.length > COLLAB_MAX_CONTROL_BYTES) { protocolError(); return; }
      let parsed: unknown;
      try { parsed = JSON.parse(data.toString('utf8')); } catch { protocolError(); return; }
      if (!Value.Check(CollabClientControl, parsed)) { protocolError(); return; }
      const message = parsed;

      if (!conn.helloed) {
        if (message.type !== 'hello') { close(conn, REALTIME_CLOSE_CODES.protocolError, 'hello required'); return; }
        const compat = checkProtocolCompatibility(
          { protocolVersion: HUB_PROTOCOL_VERSION, minClientProtocol: HUB_MIN_CLIENT_PROTOCOL },
          { protocolVersion: message.protocolVersion, minHubProtocol: message.minHubProtocol },
        );
        // Collaboration exists from protocol 3; an older client has nothing to say on this socket.
        if (compat !== 'compatible' || message.protocolVersion < 3) {
          sendControl(conn, { type: 'error', code: 'unsupported-protocol' });
          close(conn, REALTIME_CLOSE_CODES.unsupportedProtocol, 'unsupported protocol');
          return;
        }
        const resolved = resolveIdentity(principal);
        conn.helloed = true;
        conn.identity = resolved.identity;
        conn.editor = resolved.editor;
        armIdle(timings.idleTimeoutMs, REALTIME_CLOSE_CODES.heartbeatTimeout);
        sendControl(conn, {
          type: 'welcome', protocolVersion: HUB_PROTOCOL_VERSION, sessionKind: principal.kind, deviceId: principal.deviceId,
          heartbeatIntervalMs: timings.heartbeatIntervalMs, identity: resolved.identity,
        });
        return;
      }

      armIdle(timings.idleTimeoutMs, REALTIME_CLOSE_CODES.heartbeatTimeout);
      switch (message.type) {
        case 'hello': close(conn, REALTIME_CLOSE_CODES.protocolError, 'duplicate hello'); return;
        case 'heartbeat': return;
        case 'subscribe': subscribe(conn, message.channel, message.doc); return;
        case 'unsubscribe': {
          conn.ended.delete(message.channel);
          const sub = conn.subs.get(message.channel);
          if (sub) teardown(sub);
          return;
        }
      }
    });
  }

  // `@fastify/websocket` is registered once by the WebSocket host (ws-host.ts) before this scope loads.
  app.register(async (scope) => {
    scope.get(HUB_COLLAB_PATH, { websocket: true, preValidation: authHook }, (socket, request) => {
      const principal = principals.get(request);
      if (!principal) { socket.close(REALTIME_CLOSE_CODES.unauthorized, 'unauthorized'); return; }
      handleConnection(socket, principal);
    });
  });
  return hub;
}
