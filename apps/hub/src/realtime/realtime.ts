import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import websocket from '@fastify/websocket';
import Value from 'typebox/value';
import type { WebSocket } from 'ws';
import type { Db } from '@dude/sqlite-store';
import {
  HUB_MIN_CLIENT_PROTOCOL, HUB_PROTOCOL_VERSION, HUB_REALTIME_PATH, REALTIME_CLOSE_CODES, REALTIME_HEARTBEAT_INTERVAL_MS, REALTIME_HELLO_TIMEOUT_MS,
  REALTIME_IDLE_TIMEOUT_MS, REALTIME_MAX_MESSAGE_BYTES, RealtimeClientMessage, checkProtocolCompatibility,
} from '@dude/contracts/hub';
import type { RealtimeServerMessage } from '@dude/contracts/hub';
import type { HubEventMap } from '../auth/hub-events.js';
import { resolveOwner } from '../auth/owner-auth.js';
import { DEVICE_TOKEN_PREFIX, resolveDeviceToken } from '../devices/device-tokens.js';
import { touchLastSeen } from '../devices/registry.js';
import { OWNER_BEARER_PREFIX } from '../auth/sessions.js';
import { classifyCredential } from '../security/request-guard.js';
import type { HostGuard } from '../security/host-guard.js';
import { envelope } from '../server/errors.js';
import { acknowledgeTlsPin } from '../tls/rotation.js';

export interface RealtimeTimings {
  helloTimeoutMs: number;
  idleTimeoutMs: number;
  heartbeatIntervalMs: number;
  /** How often the credential is re-checked (it may have expired or been revoked). */
  revalidateIntervalMs: number;
  /** Messages allowed per window per connection. */
  rateLimit: { max: number; windowMs: number };
}

export const DEFAULT_REALTIME_TIMINGS: RealtimeTimings = {
  helloTimeoutMs: REALTIME_HELLO_TIMEOUT_MS,
  idleTimeoutMs: REALTIME_IDLE_TIMEOUT_MS,
  heartbeatIntervalMs: REALTIME_HEARTBEAT_INTERVAL_MS,
  revalidateIntervalMs: 60_000,
  rateLimit: { max: 30, windowMs: 10_000 },
};

export interface RealtimeOptions {
  db: Db;
  now: () => number;
  hostGuard: HostGuard;
  /** The current active pin (changes after a rotation). */
  activeSpki: () => string;
  timings?: Partial<RealtimeTimings>;
}

export interface RealtimeHub {
  isDeviceOnline(deviceId: string): boolean;
  /** Open sockets (all kinds). */
  connectionCount(): number;
}

declare module 'fastify' {
  interface FastifyInstance { realtime: RealtimeHub }
}

type Kind = 'owner-cookie' | 'owner-bearer' | 'device';

interface Principal {
  kind: Kind;
  deviceId: string | null;
  /** Owner-bearer sessions may be bound to a device. */
  boundDeviceId: string | null;
  sessionHash: string | null;
  /** Non-sliding liveness check. */
  stillValid(now: number): boolean;
}

interface Connection {
  socket: WebSocket;
  principal: Principal;
  helloed: boolean;
  timers: Array<NodeJS.Timeout>;
  idle: NodeJS.Timeout | undefined;
  recent: number[];
}

const sessionLive = (db: Db, sessionHash: string, now: number): boolean => {
  const at = new Date(now).toISOString();
  return db.prepare('SELECT 1 AS x FROM sessions WHERE session_hash = ? AND revoked_at IS NULL AND idle_expires_at > ? AND absolute_expires_at > ?').get(sessionHash, at, at) !== undefined;
};

/**
 * Credential types: owner cookie session (Origin must match the allowed Host), owner bearer, device token. The
 * credential is checked before the HTTP upgrade; anything else is a plain 401 and never becomes a WebSocket.
 */
function authenticate(request: FastifyRequest, options: RealtimeOptions): Principal | null {
  const credential = classifyCredential(request);
  if (credential.conflict || credential.duplicateSession) return null;
  const { db, now } = options;
  if (credential.kind === 'cookie') {
    const host = request.headers.host;
    const origin = request.headers.origin;
    if (typeof host !== 'string' || typeof origin !== 'string' || !options.hostGuard.isAllowed(host) || origin.toLowerCase() !== `https://${host.toLowerCase()}`) return null;
    const site = request.headers['sec-fetch-site'];
    if (site !== undefined && site !== 'same-origin') return null;
    const result = resolveOwner(request, { db, now, kinds: ['cookie'] });
    if (!result.ok) return null;
    const hash = result.owner.sessionHash;
    return { kind: 'owner-cookie', deviceId: null, boundDeviceId: null, sessionHash: hash, stillValid: (at) => sessionLive(db, hash, at) };
  }
  const token = credential.bearerToken;
  if (credential.kind !== 'bearer' || token === undefined) return null;
  if (token.startsWith(DEVICE_TOKEN_PREFIX)) {
    const device = resolveDeviceToken(db, token, now());
    if (!device) return null;
    return { kind: 'device', deviceId: device.deviceId, boundDeviceId: null, sessionHash: null, stillValid: (at) => resolveDeviceToken(db, token, at) !== null };
  }
  if (token.startsWith(OWNER_BEARER_PREFIX)) {
    const result = resolveOwner(request, { db, now, kinds: ['bearer'] });
    if (!result.ok) return null;
    const hash = result.owner.sessionHash;
    return { kind: 'owner-bearer', deviceId: null, boundDeviceId: result.owner.deviceId, sessionHash: hash, stillValid: (at) => sessionLive(db, hash, at) };
  }
  return null;
}

/** Registers the authenticated WebSocket and its presence/broadcast machinery (PD-034). No synchronization rides on it. */
export function registerRealtime(app: FastifyInstance, options: RealtimeOptions): RealtimeHub {
  const timings: RealtimeTimings = { ...DEFAULT_REALTIME_TIMINGS, ...options.timings };
  const connections = new Set<Connection>();
  const presence = new Map<string, number>();
  const principals = new WeakMap<FastifyRequest, Principal>();

  const hub: RealtimeHub = {
    isDeviceOnline: (deviceId) => (presence.get(deviceId) ?? 0) > 0,
    connectionCount: () => connections.size,
  };
  app.decorate('realtime', hub);

  const send = (conn: Connection, message: RealtimeServerMessage): void => {
    if (conn.socket.readyState === conn.socket.OPEN) conn.socket.send(JSON.stringify(message));
  };
  const sendEvent = (conn: Connection, event: Extract<RealtimeServerMessage, { type: 'event' }>['event'], data: Record<string, unknown>): void =>
    send(conn, { type: 'event', event, data });
  const close = (conn: Connection, code: number, reason = ''): void => {
    if (conn.socket.readyState === conn.socket.OPEN || conn.socket.readyState === conn.socket.CONNECTING) conn.socket.close(code, reason);
  };
  const where = (predicate: (conn: Connection) => boolean): Connection[] => [...connections].filter((c) => c.helloed && predicate(c));
  const isOwner = (c: Connection): boolean => c.principal.kind !== 'device';

  const onRegistryChanged = (data: HubEventMap['device-registry-changed'][0]): void => {
    for (const conn of where(isOwner)) sendEvent(conn, 'device-registry-changed', { deviceId: data.deviceId, change: data.change });
  };
  const onSessionRevoked = (data: HubEventMap['session-revoked'][0]): void => {
    for (const conn of [...connections].filter((c) => c.principal.sessionHash === data.sessionHash)) {
      sendEvent(conn, 'session-revoked', { sessionId: data.sessionId });
      close(conn, REALTIME_CLOSE_CODES.revoked, 'session revoked');
    }
  };
  const onDeviceGone = (data: HubEventMap['device-revoked'][0]): void => {
    for (const conn of [...connections].filter((c) => c.principal.deviceId === data.deviceId || c.principal.boundDeviceId === data.deviceId)) {
      sendEvent(conn, 'device-revoked', { deviceId: data.deviceId });
      close(conn, REALTIME_CLOSE_CODES.revoked, 'device revoked');
    }
  };
  const onNextPin = (data: HubEventMap['tls-next-pin'][0]): void => {
    for (const conn of where(() => true)) sendEvent(conn, 'tls-next-pin', { spkiSha256: data.spkiSha256 });
  };
  const onOwnerRecovered = (data: HubEventMap['owner-recovered'][0]): void => {
    for (const conn of where(() => true)) sendEvent(conn, 'owner-recovered', { deviceId: data.deviceId, at: data.at });
  };
  const onRecordsChanged = (data: HubEventMap['records-changed'][0]): void => {
    const envOf = (deviceId: string): string | undefined =>
      (options.db.prepare('SELECT environment_id FROM devices WHERE device_id = ?').get(deviceId) as { environment_id: string } | undefined)?.environment_id;
    for (const conn of where((c) => c.principal.kind === 'device' && c.principal.deviceId !== null && c.principal.deviceId !== data.originDeviceId)) {
      if (envOf(conn.principal.deviceId as string) === data.environmentId) sendEvent(conn, 'changes-available', { revision: data.revision });
    }
  };
  app.hubEvents.on('records-changed', onRecordsChanged);
  app.hubEvents.on('device-registry-changed', onRegistryChanged);
  app.hubEvents.on('owner-recovered', onOwnerRecovered);
  app.hubEvents.on('session-revoked', onSessionRevoked);
  app.hubEvents.on('device-revoked', onDeviceGone);
  app.hubEvents.on('device-unenrolled', onDeviceGone);
  app.hubEvents.on('tls-next-pin', onNextPin);

  const presenceChange = (deviceId: string, delta: 1 | -1): void => {
    const before = presence.get(deviceId) ?? 0;
    const after = Math.max(0, before + delta);
    if (after === 0) presence.delete(deviceId);
    else presence.set(deviceId, after);
    if ((before === 0) !== (after === 0)) app.hubEvents.emit('device-registry-changed', { deviceId, change: 'presence' });
  };

  app.addHook('preClose', async () => {
    for (const conn of [...connections]) close(conn, 1001, 'server shutting down');
    for (const conn of connections) { for (const t of conn.timers) clearInterval(t); if (conn.idle) clearTimeout(conn.idle); }
  });
  app.addHook('onClose', async () => {
    app.hubEvents.off('records-changed', onRecordsChanged);
    app.hubEvents.off('device-registry-changed', onRegistryChanged);
    app.hubEvents.off('owner-recovered', onOwnerRecovered);
    app.hubEvents.off('session-revoked', onSessionRevoked);
    app.hubEvents.off('device-revoked', onDeviceGone);
    app.hubEvents.off('device-unenrolled', onDeviceGone);
    app.hubEvents.off('tls-next-pin', onNextPin);
  });

  const authHook = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | undefined> => {
    const principal = authenticate(request, options);
    if (!principal) return reply.code(401).type('application/json').header('Cache-Control', 'no-store').send(envelope('unauthorized', 'Authentication is required.'));
    principals.set(request, principal);
    return undefined;
  };

  function handleConnection(socket: WebSocket, principal: Principal): void {
    const conn: Connection = { socket, principal, helloed: false, timers: [], idle: undefined, recent: [] };
    connections.add(conn);
    let counted = false;

    const armIdle = (ms: number, code: number): void => {
      if (conn.idle) clearTimeout(conn.idle);
      conn.idle = setTimeout(() => close(conn, code, 'timeout'), ms);
    };
    // Until hello arrives the (short) hello timeout applies, afterwards the idle timeout.
    armIdle(timings.helloTimeoutMs, REALTIME_CLOSE_CODES.protocolError);

    const revalidate = setInterval(() => {
      if (!principal.stillValid(options.now())) close(conn, REALTIME_CLOSE_CODES.unauthorized, 'credential no longer valid');
    }, timings.revalidateIntervalMs);
    revalidate.unref();
    conn.timers.push(revalidate);

    socket.on('close', () => {
      connections.delete(conn);
      for (const t of conn.timers) clearInterval(t);
      if (conn.idle) clearTimeout(conn.idle);
      if (counted && principal.deviceId) presenceChange(principal.deviceId, -1);
    });
    socket.on('error', () => { /* the close handler cleans up */ });

    socket.on('message', (data: Buffer, isBinary: boolean) => {
      const at = options.now();
      const cutoff = at - timings.rateLimit.windowMs;
      conn.recent = conn.recent.filter((t) => t > cutoff);
      conn.recent.push(at);
      if (conn.recent.length > timings.rateLimit.max) { close(conn, REALTIME_CLOSE_CODES.rateLimited, 'rate limited'); return; }
      if (isBinary || data.length > REALTIME_MAX_MESSAGE_BYTES) { close(conn, REALTIME_CLOSE_CODES.protocolError, 'invalid message'); return; }
      let parsed: unknown;
      try { parsed = JSON.parse(data.toString('utf8')); } catch { close(conn, REALTIME_CLOSE_CODES.protocolError, 'invalid message'); return; }
      if (!Value.Check(RealtimeClientMessage, parsed)) { close(conn, REALTIME_CLOSE_CODES.protocolError, 'invalid message'); return; }
      const message = parsed;
      if (!principal.stillValid(at)) { close(conn, REALTIME_CLOSE_CODES.unauthorized, 'credential no longer valid'); return; }

      if (!conn.helloed) {
        if (message.type !== 'hello') { close(conn, REALTIME_CLOSE_CODES.protocolError, 'hello required'); return; }
        const compat = checkProtocolCompatibility(
          { protocolVersion: HUB_PROTOCOL_VERSION, minClientProtocol: HUB_MIN_CLIENT_PROTOCOL },
          { protocolVersion: message.protocolVersion, minHubProtocol: message.minHubProtocol },
        );
        if (compat !== 'compatible') {
          send(conn, { type: 'error', code: 'unsupported-protocol' });
          close(conn, REALTIME_CLOSE_CODES.unsupportedProtocol, 'unsupported protocol');
          return;
        }
        conn.helloed = true;
        armIdle(timings.idleTimeoutMs, REALTIME_CLOSE_CODES.heartbeatTimeout);
        if (principal.deviceId) {
          touchLastSeen(options.db, principal.deviceId, at);
          counted = true;
          presenceChange(principal.deviceId, 1);
        }
        const next = options.db.prepare("SELECT spki_sha256 FROM tls_pins WHERE state = 'next' LIMIT 1").get() as { spki_sha256: string } | undefined;
        send(conn, {
          type: 'welcome', protocolVersion: HUB_PROTOCOL_VERSION, sessionKind: principal.kind, deviceId: principal.deviceId,
          heartbeatIntervalMs: timings.heartbeatIntervalMs, tls: { spkiSha256: options.activeSpki(), nextSpkiSha256: next?.spki_sha256 ?? null },
        });
        return;
      }

      armIdle(timings.idleTimeoutMs, REALTIME_CLOSE_CODES.heartbeatTimeout);
      switch (message.type) {
        case 'hello': close(conn, REALTIME_CLOSE_CODES.protocolError, 'duplicate hello'); return;
        case 'heartbeat':
          if (principal.deviceId) touchLastSeen(options.db, principal.deviceId, at);
          return;
        case 'tls-pin-ack':
          if (principal.deviceId) acknowledgeTlsPin(options.db, principal.deviceId, message.spkiSha256, at);
          return;
      }
    });
  }

  app.register(async (scope) => {
    await scope.register(websocket, { options: { maxPayload: REALTIME_MAX_MESSAGE_BYTES * 4 } });
    scope.get(HUB_REALTIME_PATH, { websocket: true, preValidation: authHook }, (socket, request) => {
      const principal = principals.get(request);
      if (!principal) { socket.close(REALTIME_CLOSE_CODES.unauthorized, 'unauthorized'); return; }
      handleConnection(socket, principal);
    });
  });
  return hub;
}
