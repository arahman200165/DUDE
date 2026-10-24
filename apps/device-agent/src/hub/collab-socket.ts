import { Value } from 'typebox/value';
import type { WebSocket } from 'ws';
import { isCollabRefusalTransient, parseCollabRelayFrame } from '@dude/contracts';
import type { AgentHubState, CollabRefusalReason, CollabRelayFrame, CollabRelayState } from '@dude/contracts';
import {
  COLLAB_MAX_CHANNELS, COLLAB_MAX_CONTROL_BYTES, COLLAB_MAX_FRAME_BYTES, CollabClientControl, CollabServerControl, HUB_PROTOCOL_VERSION, HUB_REALTIME_DEPTH_PROTOCOL,
  REALTIME_CLOSE_CODES, REALTIME_HEARTBEAT_INTERVAL_MS,
} from '@dude/contracts/hub';

/**
 * The Agent's half of Hub collaboration (PD-106). One pinned collaboration socket per Agent, taken on demand by the desktop that asks
 * (`collab.open`) and let go when it stops (`collab.close`, or its connection ends) after a short linger. The renderer owns the Y.Doc and the
 * editor binding; this module relays opaque frames, so it depends on neither Yjs nor `@dude/collab-doc`:
 * - hello, heartbeat and reconnect belong to the Agent; the welcome and every other Hub control frame pass to the renderer unchanged, so the
 *   renderer's link reads the identity and the subscription results itself;
 * - the renderer may send only `subscribe` and `unsubscribe` controls (checked against `CollabClientControl`) and binary frames shaped
 *   `[channel 1..8][kind 0|1][payload]`, each within the size caps, so a compromised renderer cannot put arbitrary text on the Hub socket;
 * - the socket opens only while the gate holds (online, first sync complete, no reconcile flag, no authority/trust/revoke state, and the authority
 *   check inside `openSocket`), and the gate is checked again on every reconnect and every status change.
 */

const OPEN = 1;

export interface CollabRefusal { reason: CollabRefusalReason; message: string }

export interface CollabGateInputs {
  hubState: AgentHubState;
  /** An enrollment row exists and is `enrolled`. */
  enrolled: boolean;
  /** The persisted `sync_reconcile_required` flag is set. */
  reconcileRequired: boolean;
  /** The first sync (the Merge / Use Hub / Keep local decision) is done. */
  firstSyncDone: boolean;
}

const REFUSAL_MESSAGES: Readonly<Record<CollabRefusalReason, string>> = {
  'not-enrolled': 'This device is not paired with a Hub.',
  revoked: 'This device was revoked from the Hub.',
  'authority-changed': 'The Hub is not the one this device was paired with. Reconnect this device to continue.',
  'untrusted-tls': 'The Hub certificate no longer matches the pinned key.',
  incompatible: 'This Hub and this DUDE build speak incompatible protocol versions.',
  'needs-reconcile': 'The Hub history no longer matches this device. Reconcile before collaborating.',
  'hub-offline': 'This device is not connected to the Hub.',
  'first-sync-pending': 'Finish the first sync with the Hub before collaborating.',
};

/** The reason collaboration is blocked now, or null. A permanent reason is listed before a transient one, so a changed Hub never reads as "offline". */
export function evaluateCollabGate(input: CollabGateInputs): CollabRefusal | null {
  const refuse = (reason: CollabRefusalReason): CollabRefusal => ({ reason, message: REFUSAL_MESSAGES[reason] });
  if (!input.enrolled || input.hubState === 'standalone') return refuse('not-enrolled');
  if (input.hubState === 'revoked') return refuse('revoked');
  if (input.hubState === 'authority-changed') return refuse('authority-changed');
  if (input.hubState === 'untrusted-tls') return refuse('untrusted-tls');
  if (input.hubState === 'incompatible') return refuse('incompatible');
  if (input.reconcileRequired) return refuse('needs-reconcile');
  if (input.hubState !== 'online') return refuse('hub-offline');
  if (!input.firstSyncDone) return refuse('first-sync-pending');
  return null;
}

/** The desktop connection that holds the socket: where Hub frames and state changes go. */
export interface CollabHolder {
  /** Identity of the desktop connection; a second `open` from the same id is a renderer reload, from another id a takeover. */
  readonly id: unknown;
  frame(frame: CollabRelayFrame): void;
  state(state: CollabRelayState): void;
}

export class CollabRelayError extends Error {
  constructor(readonly code: 'collab-not-open' | 'invalid-params', message: string) { super(message); }
}

export interface CollabRelayTimings {
  backoffMinMs: number;
  backoffMaxMs: number;
  /** How long the socket stays up after the last holder let go, so a renderer reload does not reconnect. */
  lingerMs: number;
  /** Upper bound of the heartbeat interval (the Hub's welcome can announce a shorter one). */
  heartbeatIntervalMs: number;
}

export const DEFAULT_COLLAB_RELAY_TIMINGS: CollabRelayTimings = { backoffMinMs: 1_000, backoffMaxMs: 60_000, lingerMs: 5_000, heartbeatIntervalMs: REALTIME_HEARTBEAT_INTERVAL_MS };

export interface CollabRelayDeps {
  /** The gate, read now. */
  gate(): CollabRefusal | null;
  /** The pinned, device-token WebSocket to the Hub's collaboration path (checks the authority first; `refreshToken` after a rejected token). */
  openSocket(options: { refreshToken: boolean }): Promise<WebSocket>;
  timings?: Partial<CollabRelayTimings>;
  random?: () => number;
}

export interface CollabRelay {
  /** Takes the socket for `holder`. Refuses (no socket) while the gate does not hold; otherwise answers at once and reports progress through `holder.state`. */
  open(holder: CollabHolder): { ok: true } | { ok: false; reason: CollabRefusalReason; message: string };
  /** Relays one renderer frame. Throws `CollabRelayError` for a caller that does not hold the socket or a frame that is not allowed; drops the frame while the socket is not welcomed. */
  send(holder: CollabHolder, frame: CollabRelayFrame): void;
  /** The holder lets go (or its connection ended): the socket lingers briefly, then closes. */
  close(holder: CollabHolder): void;
  /** Re-checks the gate; the owner calls it on every Hub or sync status change. */
  recheck(): void;
  /** Closes everything now (shutdown, store closed). */
  stop(): void;
  /** Whether a socket (connecting, open or lingering) or a hold exists; for diagnostics and tests. */
  active(): boolean;
}

const asBuffer = (data: unknown): Buffer | null => {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (Array.isArray(data) && data.every(Buffer.isBuffer)) return Buffer.concat(data as Buffer[]);
  return null;
};

export function createCollabRelay(deps: CollabRelayDeps): CollabRelay {
  const timings: CollabRelayTimings = { ...DEFAULT_COLLAB_RELAY_TIMINGS, ...deps.timings };
  const random = deps.random ?? Math.random;

  let holder: CollabHolder | null = null;
  let socket: WebSocket | null = null;
  let welcomed = false;
  let welcomeText: string | null = null;
  /** Channels the renderer subscribed on this socket: unsubscribed when the hold ends, so the next holder starts clean. */
  const channels = new Set<number>();
  let generation = 0;
  let connecting = false;
  let attempt = 0;
  let forceToken = false;
  let retryTimer: NodeJS.Timeout | null = null;
  let lingerTimer: NodeJS.Timeout | null = null;
  let heartbeatTimer: NodeJS.Timeout | null = null;
  let lastEmitted: string | null = null;

  const emit = (state: CollabRelayState): void => {
    if (holder === null) return;
    const key = JSON.stringify(state);
    if (key === lastEmitted) return;
    lastEmitted = key;
    try { holder.state(state); } catch { /* a holder must not break the relay */ }
  };
  const forward = (frame: CollabRelayFrame): void => {
    try { holder?.frame(frame); } catch { /* a holder must not break the relay */ }
  };

  const clearTimers = (): void => {
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    if (lingerTimer) { clearTimeout(lingerTimer); lingerTimer = null; }
  };

  /** Drops the socket and every timer; a late callback of the old generation does nothing. */
  function teardown(): void {
    generation++;
    connecting = false;
    welcomed = false;
    welcomeText = null;
    channels.clear();
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    clearTimers();
    const current = socket;
    socket = null;
    if (current) kill(current);
  }

  function kill(ws: WebSocket): void {
    ws.removeAllListeners();
    ws.on('error', () => undefined);
    try { ws.terminate(); } catch { /* already closed */ }
  }

  const sendRaw = (ws: WebSocket, data: string | Buffer): void => {
    if (ws.readyState !== OPEN) return;
    try { ws.send(data, { binary: typeof data !== 'string' }); } catch { /* the close handler takes over */ }
  };

  /** Ends the hold for good: the holder is told why and must open again (or stop, for a permanent reason). */
  function terminal(reason: string, code?: number): void {
    emit({ state: 'closed', ...(code === undefined ? {} : { code }), reason, willRetry: false });
    holder = null;
    teardown();
  }

  /** The gate stopped holding: a transient reason keeps the hold and waits for `recheck()` or the backoff, a permanent one ends it. */
  function gateFailed(refusal: CollabRefusal): void {
    if (!isCollabRefusalTransient(refusal.reason)) { terminal(refusal.reason); return; }
    const hadSocket = socket !== null || connecting;
    if (hadSocket) teardown();
    emit({ state: 'closed', reason: refusal.reason, willRetry: true });
    if (!retryTimer) scheduleRetry();
  }

  function scheduleRetry(): void {
    if (holder === null) return;
    const base = Math.min(timings.backoffMaxMs, timings.backoffMinMs * 2 ** attempt);
    attempt = Math.min(attempt + 1, 16);
    const delay = base + Math.floor(random() * 0.25 * base);
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => { retryTimer = null; connect(true); }, delay);
    retryTimer.unref();
  }

  function connect(isRetry: boolean): void {
    if (holder === null || socket !== null || connecting) return;
    const refusal = deps.gate();
    if (refusal) { gateFailed(refusal); return; }
    const gen = ++generation;
    connecting = true;
    if (!isRetry) emit({ state: 'connecting' });
    deps.openSocket({ refreshToken: forceToken }).then(
      (ws) => {
        if (gen !== generation || holder === null) { kill(ws); return; }
        connecting = false;
        attach(ws, gen);
      },
      (error: unknown) => {
        if (gen !== generation) return;
        connecting = false;
        const refusedNow = deps.gate();
        if (refusedNow) { gateFailed(refusedNow); return; }
        const status = (error as { status?: unknown } | null)?.status;
        if (status === 401 || status === 403) forceToken = true;
        emit({ state: 'closed', reason: 'unreachable', willRetry: true });
        scheduleRetry();
      },
    );
  }

  function attach(ws: WebSocket, gen: number): void {
    socket = ws;
    let alive = true;
    let rejectedStatus: number | null = null;
    ws.on('open', () => sendRaw(ws, JSON.stringify({ type: 'hello', protocolVersion: HUB_PROTOCOL_VERSION, minHubProtocol: HUB_REALTIME_DEPTH_PROTOCOL })));
    ws.on('pong', () => { alive = true; });
    ws.on('unexpected-response', (_request, response) => {
      rejectedStatus = response.statusCode ?? 0;
      response.resume();
      ws.terminate();
    });
    ws.on('error', () => undefined);
    ws.on('message', (data, isBinary) => {
      alive = true;
      if (gen !== generation) return;
      if (isBinary) {
        const bytes = asBuffer(data);
        if (!welcomed || holder === null || bytes === null || bytes.length === 0 || bytes.length > COLLAB_MAX_FRAME_BYTES) return;
        forward({ kind: 'binary', base64: bytes.toString('base64') });
        return;
      }
      const bytes = asBuffer(data);
      if (bytes === null || bytes.length === 0 || bytes.length > COLLAB_MAX_CONTROL_BYTES) return;
      const text = bytes.toString('utf8');
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { return; }
      if (!Value.Check(CollabServerControl, parsed)) return;
      if (parsed.type === 'welcome') {
        if (welcomed) return;
        welcomed = true;
        welcomeText = text;
        attempt = 0;
        forceToken = false;
        const interval = Math.max(1, Math.min(parsed.heartbeatIntervalMs, timings.heartbeatIntervalMs));
        heartbeatTimer = setInterval(() => {
          if (!alive) { ws.terminate(); return; }
          alive = false;
          try { ws.ping(); } catch { /* the close handler reconnects */ }
          sendRaw(ws, JSON.stringify({ type: 'heartbeat' }));
        }, interval);
        heartbeatTimer.unref();
        emit({ state: 'open' });
        forward({ kind: 'control', text });
        return;
      }
      if (!welcomed) return;
      if (parsed.type === 'doc-error') channels.delete(parsed.channel);
      forward({ kind: 'control', text });
    });
    ws.on('close', (code) => {
      if (gen !== generation || socket !== ws) return;
      onClose(code, rejectedStatus);
    });
  }

  function onClose(code: number, rejectedStatus: number | null): void {
    teardown();
    if (holder === null) return;
    if (code === REALTIME_CLOSE_CODES.unsupportedProtocol || rejectedStatus === 426 || rejectedStatus === 400 || rejectedStatus === 404) { terminal('incompatible', code); return; }
    if (code === REALTIME_CLOSE_CODES.transferred) { terminal('authority-changed', code); return; }
    if (rejectedStatus === 401 || rejectedStatus === 403 || code === REALTIME_CLOSE_CODES.unauthorized || code === REALTIME_CLOSE_CODES.revoked) forceToken = true;
    const refusal = deps.gate();
    if (refusal) { gateFailed(refusal); return; }
    emit({ state: 'closed', ...(code === 0 ? {} : { code }), reason: 'dropped', willRetry: true });
    scheduleRetry();
  }

  /** Lets go of the hold: unsubscribes what the renderer subscribed, then keeps a welcomed socket for the linger. */
  function release(): void {
    holder = null;
    lastEmitted = null;
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    if (socket !== null && welcomed) {
      for (const channel of channels) sendRaw(socket, JSON.stringify({ type: 'unsubscribe', channel }));
      channels.clear();
      if (lingerTimer) clearTimeout(lingerTimer);
      lingerTimer = setTimeout(() => { lingerTimer = null; if (holder === null) teardown(); }, timings.lingerMs);
      lingerTimer.unref();
      return;
    }
    teardown();
  }

  return {
    open(next) {
      const refusal = deps.gate();
      if (refusal) {
        // The caller that already held the socket (a reload) lets go of it; another caller's hold is left alone.
        if (holder !== null && holder.id === next.id) release();
        return { ok: false, ...refusal };
      }
      const previous = holder;
      if (previous !== null && previous.id !== next.id) {
        try { previous.state({ state: 'closed', reason: 'displaced', willRetry: false }); } catch { /* ignore */ }
      }
      if (lingerTimer) { clearTimeout(lingerTimer); lingerTimer = null; }
      holder = next;
      lastEmitted = null;
      if (socket !== null && welcomed) {
        // A reload or a takeover: the new holder starts with no subscriptions and is shown the welcome it missed.
        for (const channel of channels) sendRaw(socket, JSON.stringify({ type: 'unsubscribe', channel }));
        channels.clear();
        emit({ state: 'open' });
        if (welcomeText !== null) forward({ kind: 'control', text: welcomeText });
        return { ok: true };
      }
      if (socket !== null || connecting) { emit({ state: 'connecting' }); return { ok: true }; }
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      attempt = 0;
      forceToken = false;
      connect(false);
      return { ok: true };
    },
    send(from, frame) {
      if (holder === null || holder.id !== from.id) throw new CollabRelayError('collab-not-open', 'This connection does not hold the collaboration socket.');
      const parsed = parseCollabRelayFrame(frame);
      if (parsed === null) throw new CollabRelayError('invalid-params', 'The collaboration frame is malformed or too large.');
      let outbound: string | Buffer;
      if (parsed.kind === 'control') {
        let message: unknown;
        try { message = JSON.parse(parsed.text); } catch { throw new CollabRelayError('invalid-params', 'The collaboration control frame is not JSON.'); }
        if (!Value.Check(CollabClientControl, message) || (message.type !== 'subscribe' && message.type !== 'unsubscribe')) {
          throw new CollabRelayError('invalid-params', 'Only subscribe and unsubscribe may be sent; hello and heartbeat belong to the Agent.');
        }
        if (welcomed) {
          if (message.type === 'subscribe') channels.add(message.channel);
          else channels.delete(message.channel);
        }
        outbound = parsed.text;
      } else {
        const bytes = Buffer.from(parsed.base64, 'base64');
        if (bytes.length < 2 || bytes[0]! < 1 || bytes[0]! > COLLAB_MAX_CHANNELS || bytes[1]! > 1) throw new CollabRelayError('invalid-params', 'The collaboration frame is not [channel][kind][payload].');
        outbound = bytes;
      }
      if (!welcomed || socket === null) return;
      sendRaw(socket, outbound);
    },
    close(from) {
      if (holder !== null && holder.id === from.id) release();
    },
    recheck() {
      if (holder === null && socket === null) return;
      const refusal = deps.gate();
      if (holder === null) {
        // Only the linger is left: a failing gate closes it now.
        if (refusal) teardown();
        return;
      }
      if (refusal) { gateFailed(refusal); return; }
      // The gate holds again: a transient wait ends now instead of at the next backoff.
      if (socket === null && !connecting && retryTimer) { clearTimeout(retryTimer); retryTimer = null; connect(true); }
    },
    stop() {
      holder = null;
      teardown();
    },
    active: () => holder !== null || socket !== null || connecting,
  };
}
