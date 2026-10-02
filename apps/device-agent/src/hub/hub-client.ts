import { sign } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { WebSocket } from 'ws';
import { Value } from 'typebox/value';
import { HubApiError, HubProtocolError, createHubClient } from '@dude/api-client';
import type { HubClient, HubTransport } from '@dude/api-client';
import type { AgentHubState, AgentHubStatus } from '@dude/contracts';
import {
  DEVICE_TOKEN_TTL_MS, HUB_MIN_CLIENT_PROTOCOL, HUB_PROTOCOL_VERSION, HUB_REALTIME_PATH, REALTIME_CLOSE_CODES, REALTIME_HEARTBEAT_INTERVAL_MS,
  RealtimeServerMessage, deviceAuthMessage, ownerRecoveryMessage,
} from '@dude/contracts/hub';
import type { Db } from '@dude/sqlite-store';
import { clearEnrollment, getEnrollment, markRevoked, promoteNextPin, publicEnrollment, setNextPin, touchContact } from '../store/repos/hub-enrollment.repo.js';
import type { HubEnrollmentRow } from '../store/repos/hub-enrollment.repo.js';
import { loadDeviceKey } from '../native/device-key.js';
import type { DpapiPort } from '../native/windows-sys-client.js';
import { HubManagerError } from './errors.js';
import { createOwnerSession } from './owner-session.js';
import type { OwnerSession } from './owner-session.js';
import { PIN_MISMATCH_CODE, createPinnedTransport, pinnedTlsOptions, spkiSha256Of } from './pinned-transport.js';
import type { PinnedTarget } from './pinned-transport.js';

export interface HubTimings {
  heartbeatIntervalMs: number;
  backoffMinMs: number;
  backoffMaxMs: number;
  /** Fraction of the device token lifetime after which it is refreshed. */
  tokenRefreshFraction: number;
  /** Minimum wait after the Hub answers 429/423: a challenge that succeeds but whose token call is throttled would otherwise starve the bucket. */
  rateLimitBackoffMs: number;
}

export const DEFAULT_HUB_TIMINGS: HubTimings = {
  heartbeatIntervalMs: REALTIME_HEARTBEAT_INTERVAL_MS, backoffMinMs: 1_000, backoffMaxMs: 60_000, tokenRefreshFraction: 0.8, rateLimitBackoffMs: 10_000,
};

export interface ManagedDevice {
  deviceId: string;
  displayName: string;
  platform: string;
  appVersion: string;
  capabilities: Record<string, boolean>;
}

export interface HubManagerDeps {
  db: Db;
  dpapi: DpapiPort;
  now: () => Date;
  /** The local device record (id, name, platform...). Read lazily: it can change after a rename. */
  device: () => ManagedDevice;
  timings?: Partial<HubTimings>;
  random?: () => number;
  /** Test seam; defaults to the pinned node:https transport. */
  createTransport?: (target: PinnedTarget) => HubTransport;
}

export interface HubConnectionManager {
  readonly owner: OwnerSession;
  status(): AgentHubStatus;
  /** Begins (or resumes) the connection loop when an `enrolled` enrollment exists; sets state otherwise. */
  start(): void;
  /** Stops the loop and drops every in-memory credential. The enrollment row is untouched. */
  stop(): void;
  onChange(listener: (status: AgentHubStatus) => void): () => void;
  /** Pinned, credential-free call (hello, tls). */
  call<T>(fn: (api: HubClient) => Promise<T>): Promise<T>;
  /** Call with a valid device token; refreshes once on 401/403 and handles revocation. */
  deviceCall<T>(fn: (api: HubClient, deviceToken: string) => Promise<T>, options?: { authRetryOn403?: boolean }): Promise<T>;
  /**
   * Device-assisted owner recovery (PD-029): challenge, sign with the device key, POST the new password. Fails with
   * `not-trusted` (the Hub does not trust this device for recovery) or `owner-recovery-failed`. The caller is
   * responsible for the user-presence gate; the password is never stored or logged.
   */
  recoverOwner(newPassword: string): Promise<void>;
  /** Tells the Hub (online) then clears the local enrollment. */
  unenroll(options?: { force?: boolean }): Promise<{ hubStillListsDevice: boolean }>;
}

type ConfirmResult = 'revoked' | 'active' | 'unknown';

const TLS_ERROR_CODES = /^(ERR_TLS_|ERR_SSL_|CERT_|DEPTH_ZERO|SELF_SIGNED|UNABLE_TO_|HOSTNAME_MISMATCH|ERR_OSSL|EPROTO)/;
const isTlsError = (error: unknown): boolean => {
  const code = (error as { code?: unknown } | null)?.code;
  return code === PIN_MISMATCH_CODE || (typeof code === 'string' && TLS_ERROR_CODES.test(code));
};
const throttled = (error: unknown): boolean => error instanceof HubApiError && (error.status === 429 || error.status === 423);
const isAuthRejected = (error: unknown): boolean => error instanceof HubApiError && (error.status === 401 || error.status === 403);

/**
 * One per open store (PD-034). Keeps the Hub connection alive whenever the store is open and an enrollment exists, with or
 * without a desktop attached. The device key is DPAPI-unwrapped once per process and lives only in memory.
 */
export function createHubConnectionManager(deps: HubManagerDeps): HubConnectionManager {
  const timings: HubTimings = { ...DEFAULT_HUB_TIMINGS, ...deps.timings };
  const random = deps.random ?? Math.random;
  const makeTransport = deps.createTransport ?? ((target: PinnedTarget): HubTransport => createPinnedTransport(target));
  const listeners = new Set<(status: AgentHubStatus) => void>();

  let state: AgentHubState = 'standalone';
  let lastError: string | null = null;
  let running = false;
  let generation = 0;
  let attempt = 0;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let socket: WebSocket | null = null;
  let heartbeatTimer: NodeJS.Timeout | null = null;
  let deviceKey: KeyObject | null = null;
  let keyLoading: Promise<KeyObject> | null = null;
  let token: { value: string; refreshAtMs: number } | null = null;
  let tokenFlight: Promise<string> | null = null;
  let nextPinChain: Promise<void> = Promise.resolve();
  let hubVersion: string | null = null;
  let recoveryTrusted: boolean | null = null;
  let metaFlight: Promise<void> | null = null;

  const status = (): AgentHubStatus => {
    const enrollment = publicEnrollment(deps.db);
    return { state, lastError, lastContactAt: enrollment?.lastContactAt ?? null, ownerSignedIn: owner.status().signedIn, enrollment, hubVersion, recoveryTrusted };
  };
  const emit = (): void => {
    const snapshot = status();
    for (const listener of [...listeners]) { try { listener(snapshot); } catch { /* a listener must not break the connection */ } }
  };
  const setState = (next: AgentHubState, error: string | null = null): void => {
    if (state === next && lastError === error) return;
    state = next;
    lastError = error;
    emit();
  };

  const targetOf = (enrollment: HubEnrollmentRow, onPeerSpki?: (spki: string) => void): PinnedTarget & { url: URL } => {
    const url = new URL(enrollment.hubUrl);
    return {
      url, host: url.hostname, port: Number(url.port || 443),
      ca: enrollment.certNextPem ? [enrollment.certActivePem, enrollment.certNextPem] : [enrollment.certActivePem],
      pins: enrollment.spkiNext ? [enrollment.spkiActive, enrollment.spkiNext] : [enrollment.spkiActive],
      ...(onPeerSpki ? { onPeerSpki } : {}),
    };
  };

  /** Promotes the staged pin once a connection has been verified against it (the Hub activated the next certificate). */
  const maybePromote = (peerSpki: string | null): void => {
    if (peerSpki === null) return;
    const current = getEnrollment(deps.db);
    if (current && current.spkiNext !== null && current.spkiNext === peerSpki) promoteNextPin(deps.db, deps.now());
  };

  // --- Calls ----------------------------------------------------------------------------------------------------------

  const requireEnrollment = (): HubEnrollmentRow => {
    const enrollment = getEnrollment(deps.db);
    if (!enrollment) throw new HubManagerError('not-enrolled', 'This device is not enrolled with a Hub.');
    if (enrollment.state === 'revoked') throw new HubManagerError('enrollment-revoked', 'This device was revoked from the Hub. Remove the enrollment and pair again.');
    return enrollment;
  };

  async function call<T>(fn: (api: HubClient) => Promise<T>): Promise<T> {
    const enrollment = requireEnrollment();
    let peer: string | null = null;
    const api = createHubClient(makeTransport(targetOf(enrollment, (spki) => { peer = spki; })), { clientProtocol: HUB_PROTOCOL_VERSION, minHubProtocol: HUB_MIN_CLIENT_PROTOCOL });
    try {
      const result = await fn(api);
      maybePromote(peer);
      touchContact(deps.db, deps.now());
      return result;
    } catch (error) {
      if (error instanceof HubApiError || error instanceof HubProtocolError || error instanceof HubManagerError) throw error;
      if (isTlsError(error)) {
        if (running) { setState('untrusted-tls', 'The Hub certificate no longer matches the pinned key. Pair this device again.'); stopLoop(); }
        throw new HubManagerError('tls-untrusted', 'The Hub certificate does not match the pinned key.');
      }
      throw new HubManagerError('hub-unreachable', error instanceof Error ? error.message : 'The Hub could not be reached.');
    }
  }

  async function loadKey(): Promise<KeyObject> {
    if (deviceKey) return deviceKey;
    keyLoading ??= (async () => {
      const enrollment = requireEnrollment();
      try {
        deviceKey = await loadDeviceKey(deps.dpapi, enrollment.wrappedPrivateKey);
        return deviceKey;
      } catch {
        throw new HubManagerError('dpapi-unavailable', 'The device key could not be unlocked on this account.');
      } finally {
        keyLoading = null;
      }
    })();
    return keyLoading;
  }

  async function fetchToken(): Promise<string> {
    const key = await loadKey();
    const enrollment = requireEnrollment();
    const { deviceId } = deps.device();
    let rejected: HubApiError | null = null;
    for (let tries = 0; ; tries++) {
      try {
        const challenge = await call((api) => api.deviceChallenge(deviceId));
        const message = deviceAuthMessage({ hubInstanceId: enrollment.hubInstanceId, nonce: challenge.nonce, deviceId });
        const signature = sign(null, Buffer.from(message, 'utf8'), key).toString('base64url');
        const issued = await call((api) => api.deviceToken({ deviceId, nonce: challenge.nonce, signature }));
        token = { value: issued.accessToken, refreshAtMs: deps.now().getTime() + timings.tokenRefreshFraction * DEVICE_TOKEN_TTL_MS };
        return issued.accessToken;
      } catch (error) {
        // A lost nonce race looks like a 401; one fresh attempt tells it apart from a rejected device.
        if (tries === 0 && error instanceof HubApiError && error.status === 401) { rejected = error; continue; }
        // The retry itself failed for another reason (throttled, offline): the first answer, a rejection, is the one that matters.
        throw rejected !== null && !(error instanceof HubApiError && error.status === 401) ? rejected : error;
      }
    }
  }

  function getToken(force = false): Promise<string> {
    if (!force && token && deps.now().getTime() < token.refreshAtMs) return Promise.resolve(token.value);
    tokenFlight ??= fetchToken().finally(() => { tokenFlight = null; });
    return tokenFlight;
  }

  async function confirmRevoked(): Promise<ConfirmResult> {
    let fresh: string;
    try { fresh = await getToken(true); } catch (error) { return isAuthRejected(error) ? 'revoked' : 'unknown'; }
    try {
      const info = await call((api) => api.deviceSelf(fresh));
      return info.revokedAt !== null || info.unenrolledAt !== null ? 'revoked' : 'active';
    } catch (error) {
      return isAuthRejected(error) ? 'revoked' : 'unknown';
    }
  }

  function revokedNow(): void {
    markRevoked(deps.db, deps.now());
    stopLoop();
    setState('revoked', 'This device was revoked from the Hub. Pair it again to reconnect.');
  }

  async function deviceCall<T>(fn: (api: HubClient, deviceToken: string) => Promise<T>, options: { authRetryOn403?: boolean } = {}): Promise<T> {
    const retryOn403 = options.authRetryOn403 !== false;
    const rejected = (error: unknown): boolean => error instanceof HubApiError && (error.status === 401 || (retryOn403 && error.status === 403));
    const attemptWith = async (force: boolean): Promise<T> => {
      const value = await getToken(force);
      return call((api) => fn(api, value));
    };
    try {
      return await attemptWith(false);
    } catch (error) {
      if (!rejected(error)) throw error;
      token = null;
      try {
        return await attemptWith(true);
      } catch (second) {
        if (rejected(second) && getEnrollment(deps.db)?.state === 'enrolled' && await confirmRevoked() === 'revoked') revokedNow();
        throw second;
      }
    }
  }

  // --- Realtime loop ---------------------------------------------------------------------------------------------------

  function clearSocket(): void {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    const current = socket;
    socket = null;
    if (current) {
      current.removeAllListeners();
      current.on('error', () => undefined);
      try { current.terminate(); } catch { /* already closed */ }
    }
  }

  /** Refreshes the Hub version (public hello) and this device's recovery trust (GET /devices/self); pushes status when either changed. */
  function refreshMeta(): void {
    metaFlight ??= (async () => {
      const gen = generation;
      let changed = false;
      try {
        const hello = await call((api) => api.hello());
        if (hello.hubVersion !== hubVersion) { hubVersion = hello.hubVersion; changed = true; }
        const info = await deviceCall((api, value) => api.deviceSelf(value));
        if (gen === generation && info.recoveryTrusted !== recoveryTrusted) { recoveryTrusted = info.recoveryTrusted; changed = true; }
      } catch { /* informational; the next connect or registry change retries */ }
      if (changed) emit();
    })().finally(() => { metaFlight = null; });
  }

  function stopLoop(): void {
    running = false;
    recoveryTrusted = null;
    generation++;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    clearSocket();
    token = null;
    deviceKey = null;
    owner.clear();
  }

  function scheduleReconnect(minDelayMs = 0): void {
    if (!running) return;
    const base = Math.min(timings.backoffMaxMs, timings.backoffMinMs * 2 ** attempt);
    attempt = Math.min(attempt + 1, 16);
    const delay = Math.max(minDelayMs, Math.min(timings.backoffMaxMs, base)) + Math.floor(random() * 0.25 * base);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => { reconnectTimer = null; void connectOnce().catch(() => { if (running) { setState('offline', 'The Hub connection failed.'); scheduleReconnect(); } }); }, delay);
  }

  /** Classifies a failure of the connection attempt and decides whether to retry. */
  async function onFailure(error: unknown, gen: number): Promise<void> {
    if (gen !== generation || !running) return;
    if (isTlsError(error) || (error instanceof HubManagerError && error.code === 'tls-untrusted')) {
      setState('untrusted-tls', 'The Hub certificate no longer matches the pinned key. Pair this device again.');
      stopLoop();
      return;
    }
    if (isAuthRejected(error)) {
      // The device could not authenticate at all: confirm, then stop for good if the Hub no longer knows it.
      if (await confirmRevoked() === 'revoked') { revokedNow(); return; }
    }
    if (gen !== generation || !running) return;
    const message = error instanceof HubManagerError ? error.message : error instanceof Error ? error.message : 'The Hub could not be reached.';
    setState('offline', message);
    scheduleReconnect(throttled(error) ? timings.rateLimitBackoffMs : 0);
  }

  async function connectOnce(): Promise<void> {
    if (!running) return;
    const gen = generation;
    const enrollment = getEnrollment(deps.db);
    if (!enrollment || enrollment.state !== 'enrolled') { stopLoop(); setState(enrollment ? 'revoked' : 'standalone'); return; }
    if (state !== 'offline') setState('connecting', null);
    let value: string;
    try {
      value = await getToken();
    } catch (error) {
      await onFailure(error, gen);
      return;
    }
    if (gen !== generation || !running) return;
    openSocket(enrollment, value, gen);
  }

  function openSocket(enrollment: HubEnrollmentRow, value: string, gen: number): void {
    let peer: string | null = null;
    const target = targetOf(enrollment, (spki) => { peer = spki; });
    const wsUrl = `wss://${target.url.host}${HUB_REALTIME_PATH}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl, { ...pinnedTlsOptions(target), headers: { authorization: `Bearer ${value}` }, handshakeTimeout: 15_000, perMessageDeflate: false, maxPayload: 64 * 1024 });
    } catch (error) {
      void onFailure(error, gen);
      return;
    }
    socket = ws;
    let welcomed = false;
    let rejectedStatus: number | null = null;
    let socketError: unknown = null;
    let alive = true;
    const send = (message: unknown): void => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message)); };

    ws.on('open', () => send({ type: 'hello', protocolVersion: HUB_PROTOCOL_VERSION, minHubProtocol: HUB_MIN_CLIENT_PROTOCOL }));
    ws.on('pong', () => { alive = true; });
    ws.on('unexpected-response', (_req, res) => {
      rejectedStatus = res.statusCode ?? 0;
      res.resume();
      ws.terminate();
    });
    ws.on('error', (error) => { socketError = error; });
    ws.on('message', (data, isBinary) => {
      alive = true;
      if (isBinary || gen !== generation) return;
      let parsed: unknown;
      try { parsed = JSON.parse(data.toString('utf8')); } catch { return; }
      if (!Value.Check(RealtimeServerMessage, parsed)) return;
      if (parsed.type === 'welcome') {
        welcomed = true;
        attempt = 0;
        maybePromote(peer);
        maybePromote(parsed.tls.spkiSha256);
        touchContact(deps.db, deps.now());
        setState('online', null);
        const interval = Math.max(1, Math.min(parsed.heartbeatIntervalMs, timings.heartbeatIntervalMs));
        heartbeatTimer = setInterval(() => {
          if (!alive) { ws.terminate(); return; }
          alive = false;
          try { ws.ping(); } catch { /* the close handler reconnects */ }
          send({ type: 'heartbeat' });
        }, interval);
        heartbeatTimer.unref();
        if (parsed.tls.nextSpkiSha256 !== null) queueNextPin(parsed.tls.nextSpkiSha256, send);
        refreshMeta();
        return;
      }
      if (parsed.type === 'event' && parsed.event === 'owner-recovered') {
        // Every owner session was revoked by the Hub (device-assisted recovery): the held bearer is dead.
        owner.clear();
        emit();
        return;
      }
      if (parsed.type === 'event' && parsed.event === 'device-registry-changed') { refreshMeta(); return; }
      if (parsed.type === 'event' && parsed.event === 'tls-next-pin') {
        const announced = parsed.data['spkiSha256'];
        if (typeof announced === 'string') queueNextPin(announced, send);
      }
    });
    ws.on('close', (code) => {
      if (gen !== generation || socket !== ws) return;
      clearSocket();
      onClose(code).catch(() => { if (running && gen === generation) { setState('offline', 'The Hub connection failed.'); scheduleReconnect(); } });
    });

    async function onClose(code: number): Promise<void> {
      if (!running || gen !== generation) return;
      if (socketError && isTlsError(socketError)) { await onFailure(socketError, gen); return; }
      if (code === REALTIME_CLOSE_CODES.unsupportedProtocol) {
        setState('incompatible', 'This Hub and this DUDE build speak incompatible protocol versions.');
        stopLoop();
        return;
      }
      const authFailed = rejectedStatus === 401 || rejectedStatus === 403 || code === REALTIME_CLOSE_CODES.revoked || code === REALTIME_CLOSE_CODES.unauthorized;
      if (authFailed) {
        token = null;
        const verdict = await confirmRevoked();
        if (gen !== generation || !running) return;
        if (verdict === 'revoked') { revokedNow(); return; }
      }
      if (rejectedStatus === 426 || rejectedStatus === 400) {
        setState('incompatible', 'The Hub rejected the connection request.');
        stopLoop();
        return;
      }
      const reason = socketError instanceof Error ? socketError.message : welcomed ? 'The Hub closed the connection.' : 'The Hub connection could not be established.';
      setState('offline', reason);
      scheduleReconnect();
    }
  }

  /** Fetches the announced next certificate over the pinned channel, verifies it against the announced pin and acks it. */
  function queueNextPin(announced: string, send: (message: unknown) => void): void {
    const stageOnce = async (): Promise<void> => {
      const current = getEnrollment(deps.db);
      if (!current || current.state !== 'enrolled' || announced === current.spkiActive) return;
      if (current.spkiNext !== announced) {
        const certs = await call((api) => api.tlsCertificates());
        if (certs.next === null || certs.next.spkiSha256 !== announced) return;
        if (spkiSha256Of(certs.next.certPem) !== announced) return;
        setNextPin(deps.db, announced, certs.next.certPem, deps.now());
      }
      send({ type: 'tls-pin-ack', spkiSha256: announced });
    };
    const gen = generation;
    nextPinChain = nextPinChain.then(async () => {
      // The certificate endpoint is rate limited like the credential endpoints: retry a few times before giving up
      // (the next welcome announces the pin again).
      for (let tries = 0; tries < 5 && gen === generation; tries++) {
        try { await stageOnce(); return; } catch (error) {
          await new Promise((resolve) => setTimeout(resolve, throttled(error) ? timings.rateLimitBackoffMs : timings.backoffMinMs * 2 ** tries));
        }
      }
    }).catch(() => undefined);
  }

  // --- Lifecycle ---------------------------------------------------------------------------------------------------------

  const owner = createOwnerSession({ now: deps.now, call, deviceCall });

  return {
    owner,
    status,
    onChange: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    call,
    deviceCall,
    start() {
      const enrollment = getEnrollment(deps.db);
      if (!enrollment) { stopLoop(); setState('standalone'); return; }
      if (enrollment.state === 'revoked') { stopLoop(); setState('revoked', 'This device was revoked from the Hub. Pair it again to reconnect.'); return; }
      if (running) return;
      running = true;
      generation++;
      attempt = 0;
      setState('connecting', null);
      void connectOnce().catch(() => { if (running) { setState('offline', 'The Hub connection failed.'); scheduleReconnect(); } });
    },
    stop() {
      stopLoop();
    },
    async recoverOwner(newPassword) {
      const key = await loadKey();
      const enrollment = requireEnrollment();
      const { deviceId } = deps.device();
      try {
        await deviceCall(async (api, value) => {
          const challenge = await api.deviceRecoveryChallenge(value);
          const message = ownerRecoveryMessage({ hubInstanceId: enrollment.hubInstanceId, nonce: challenge.nonce, deviceId });
          const signature = sign(null, Buffer.from(message, 'utf8'), key).toString('base64url');
          return api.deviceRecover(value, { nonce: challenge.nonce, signature, newPassword });
        }, { authRetryOn403: false });
      } catch (error) {
        if (error instanceof HubApiError && error.status === 403) throw new HubManagerError('not-trusted', 'The Hub does not trust this device for owner recovery.');
        if (error instanceof HubApiError && error.status === 401) throw new HubManagerError('owner-recovery-failed', 'The Hub could not verify the recovery request.');
        throw error;
      }
      // Every owner session was revoked by the Hub, including the bearer held in memory.
      owner.clear();
    },
    async unenroll(options = {}) {
      const enrollment = getEnrollment(deps.db);
      if (!enrollment) throw new HubManagerError('not-enrolled', 'This device is not enrolled with a Hub.');
      let hubStillListsDevice = false;
      if (enrollment.state === 'enrolled') {
        try {
          await deviceCall((api, value) => api.unenrollSelf(value));
        } catch (error) {
          // The Hub already forgot this device (revoked): nothing left to tell it.
          if (!isAuthRejected(error)) {
            if (options.force !== true) throw new HubManagerError('hub-unreachable', 'The Hub could not be reached, so it was not told. Try again, or remove the enrollment on this device only.');
            hubStillListsDevice = true;
          }
        }
      }
      stopLoop();
      clearEnrollment(deps.db);
      setState('standalone', null);
      return { hubStillListsDevice };
    },
  };
}
