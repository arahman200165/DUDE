import { ipcMain, type BrowserWindow } from 'electron';
import type { AgentHubOwnerStatus, AgentHubStatus, AgentMethod, AgentMethodMap } from '@dude/contracts';
import type { DesktopHubOwnerStatus, DesktopHubProbe, DesktopHubResult, DesktopHubStatus } from '@dude/contracts/shared/models/platform-bridge.model';
import { isUuidShaped, validateDisplayName } from '@dude/persistence';
import { DeviceStoreError } from './agent-host';
import type { DeviceStoreHost } from './agent-host';
import { getDeviceStoreHost } from './store-client';
import { registerLocalHubHandlers } from './local-hub';
import { registerHubWebHandlers } from './hub-web-bridge';
import type { HubWebDeps } from './hub-web-bridge';
import type { LocalHubDeps } from './local-hub';
import { requestUserConsent } from './user-consent';
import type { UserConsent } from './user-consent';

/**
 * Hub administration for the renderer: `dude:hub:<method>` (one per `DesktopHubBridge` method) and the
 * `dude:hub:statusChanged` push. Main is the trust boundary: each handler checks the sender is this window's
 * own `webContents`, strictly validates the payload (exact arity, shapes, bounded lengths) and only then calls
 * the Device Agent. Results are mapped to the renderer-facing shapes and deep-scrubbed of credential-like keys,
 * and failures become `{ ok: false, error: { code, message } }`: never a stack trace. Passwords are only ever
 * forwarded to the agent; nothing here logs a payload.
 */

const FORBIDDEN = 'forbidden';
const PAIRING_PREFIX = 'dude-pair:v1:';
const BASE64URL = /^[A-Za-z0-9_-]{1,128}$/;
const SESSION_ID = /^[0-9a-f]{16}$/;
const HOST = /^[A-Za-z0-9.:_\-[\]]{1,255}$/;

type Fail = { readonly ok: false; readonly code: string; readonly message: string };
type Parsed<P> = { readonly ok: true; readonly params: P } | Fail;
const bad = (message = 'Invalid request.'): Fail => ({ ok: false, code: 'bad-request', message });

const fail = (code: string, message: string): DesktopHubResult<never> => ({ ok: false, error: { code, message } });

const isString = (v: unknown, min: number, max: number): v is string => typeof v === 'string' && v.length >= min && v.length <= max;
const isPort = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 65535;

/** Keys that must never cross to the renderer, whatever the agent returns. `confirmToken` is deliberately not here: it is the single-use preview/confirm handle the UI must hold. */
const SCRUBBED_KEYS = new Set(['accesstoken', 'refreshtoken', 'sessiontoken', 'token', 'privatekey', 'wrapped', 'wrappedkey', 'password', 'secret']);
const MAX_SCRUB_DEPTH = 16;

export function scrubCredentials<T>(value: T, depth = 0): T {
  if (depth > MAX_SCRUB_DEPTH || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => scrubCredentials(item, depth + 1)) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (SCRUBBED_KEYS.has(key.toLowerCase())) continue;
    out[key] = scrubCredentials(item, depth + 1);
  }
  return out as T;
}

export function toDesktopStatus(status: AgentHubStatus): DesktopHubStatus {
  const enrollment = status.enrollment;
  return {
    enrollmentState: enrollment ? enrollment.state : 'standalone',
    hubUrl: enrollment?.hubUrl ?? null,
    environmentId: enrollment?.environmentId ?? null,
    hubInstanceId: enrollment?.hubInstanceId ?? null,
    hubVersion: status.hubVersion,
    recoveryTrusted: enrollment ? status.recoveryTrusted : null,
    reachable: enrollment ? (status.state === 'online' ? true : status.state === 'offline' ? false : null) : null,
    ...(enrollment && status.state !== 'standalone' && status.state !== 'revoked' ? { connection: status.state } : {}),
    lastError: status.lastError,
    lastContactAt: status.lastContactAt,
  };
}

const toOwner = (status: AgentHubOwnerStatus): DesktopHubOwnerStatus => ({ signedIn: status.signedIn, ownerDisplayName: status.displayName, expiresAt: status.expiresAt });

interface Definition<M extends AgentMethod, P, R> {
  readonly channel: string;
  readonly method: M;
  readonly parse: (args: readonly unknown[]) => Parsed<AgentMethodMap[M]['params']> & { readonly ctx?: P };
  readonly map?: (result: AgentMethodMap[M]['result'], ctx: P | undefined, host: DeviceStoreHost) => R | Promise<R>;
}

const none = (args: readonly unknown[]): Parsed<Record<string, never>> => (args.length === 0 ? { ok: true, params: {} } : bad());
const uuidArg = (v: unknown): v is string => isUuidShaped(v);
const tokenArg = (v: unknown): v is string => typeof v === 'string' && BASE64URL.test(v);

export const RECOVERY_CONSENT_MESSAGE = "Confirm it's you to reset the DUDE Hub owner password";

/** The window handle as a decimal string: the little-endian pointer-size integer Electron returns. */
export function nativeHandleString(handle: Buffer): string {
  return handle.length >= 8 ? handle.readBigUInt64LE(0).toString() : handle.readUInt32LE(0).toString();
}

export function registerHubHandlers(
  window: BrowserWindow, host: () => DeviceStoreHost | null = getDeviceStoreHost, consent: UserConsent = requestUserConsent, localHub: Partial<LocalHubDeps> = {}, hubWeb: Partial<HubWebDeps> = {},
): void {
  const own = (sender: unknown): boolean => sender === window.webContents;

  const define = <M extends AgentMethod, P = undefined, R = AgentMethodMap[M]['result']>(def: Definition<M, P, R>): void => {
    ipcMain.handle(def.channel, async (event, ...args: unknown[]): Promise<DesktopHubResult<R>> => {
      if (!own(event.sender)) return fail(FORBIDDEN, 'forbidden');
      const parsed = def.parse(args);
      if (!parsed.ok) return fail(parsed.code, parsed.message);
      const h = host();
      if (!h) return fail('unavailable', 'The device agent is not running.');
      try {
        const raw = await h.call(def.method, parsed.params);
        const mapped = def.map ? await def.map(raw, (parsed as { ctx?: P }).ctx, h) : (raw as unknown as R);
        return { ok: true, result: scrubCredentials(mapped) };
      } catch (error) {
        if (error instanceof DeviceStoreError) return fail(error.code, error.message);
        return fail('internal', 'The Hub request failed.');
      }
    });
  };

  define({
    channel: 'dude:hub:status', method: 'hub.status', parse: none,
    map: (status): DesktopHubStatus => toDesktopStatus(status),
  });

  define({
    channel: 'dude:hub:probeLocal', method: 'hub.probeLocal',
    parse: (args) => {
      if (args.length > 1) return bad();
      const [port] = args;
      if (port === undefined) return { ok: true, params: {}, ctx: null as number | null };
      return isPort(port) ? { ok: true, params: { port }, ctx: port as number | null } : bad('Invalid port.');
    },
    map: (probe, port): DesktopHubProbe => ({
      found: probe.found, port: probe.found ? (port ?? null) : null, hubInstanceId: probe.hubInstanceId, hubVersion: probe.hubVersion, bootstrapped: probe.bootstrapped,
    }),
  });

  define({
    channel: 'dude:hub:enroll', method: 'hub.enroll',
    parse: (args) => {
      if (args.length !== 1) return bad();
      const [pairing] = args;
      if (!isString(pairing, 1, 512) || !pairing.startsWith(PAIRING_PREFIX)) return bad('That is not a DUDE pairing string.');
      return { ok: true, params: { pairingString: pairing } };
    },
    map: async (status, _ctx, h) => {
      const enrollment = status.enrollment;
      if (!enrollment) throw new DeviceStoreError('internal', 'Enrollment did not complete.');
      let deviceId = '';
      try { deviceId = (await h.call('store.hydrate', {})).device?.deviceId ?? ''; } catch { /* the id is informational */ }
      return { deviceId, environmentId: enrollment.environmentId, hubInstanceId: enrollment.hubInstanceId, hubUrl: enrollment.hubUrl };
    },
  });

  define({
    channel: 'dude:hub:unenroll', method: 'hub.unenroll',
    parse: (args) => {
      if (args.length > 1) return bad();
      const [force] = args;
      if (force === undefined) return { ok: true, params: {} };
      return typeof force === 'boolean' ? { ok: true, params: { force } } : bad();
    },
    map: (result) => ({ unenrolled: true, hubNotified: !result.hubStillListsDevice }),
  });

  define({ channel: 'dude:hub:owner:status', method: 'hub.owner.status', parse: none, map: toOwner });

  define({
    channel: 'dude:hub:owner:signIn', method: 'hub.owner.signIn',
    parse: (args) => (args.length === 1 && isString(args[0], 1, 1024) ? { ok: true, params: { password: args[0] } } : bad()),
    map: toOwner,
  });

  define({ channel: 'dude:hub:owner:signOut', method: 'hub.owner.signOut', parse: none });
  define({ channel: 'dude:hub:owner:listDevices', method: 'hub.owner.listDevices', parse: none });
  define({ channel: 'dude:hub:owner:syncSummary', method: 'hub.owner.syncSummary', parse: none });
  define({ channel: 'dude:hub:owner:diagnostics', method: 'hub.owner.diagnostics', parse: none });
  define({ channel: 'dude:hub:agentDiagnostics', method: 'hub.diagnostics', parse: none });

  define({
    channel: 'dude:hub:owner:createPairingCode', method: 'hub.owner.createPairingCode',
    parse: (args) => {
      if (args.length > 1) return bad();
      const [hostName] = args;
      if (hostName === undefined) return { ok: true, params: {} };
      return typeof hostName === 'string' && HOST.test(hostName) ? { ok: true, params: { host: hostName } } : bad('Invalid host.');
    },
  });

  define({
    channel: 'dude:hub:owner:renameDevice', method: 'hub.owner.renameDevice',
    parse: (args) => {
      if (args.length !== 2 || !uuidArg(args[0])) return bad();
      const name = validateDisplayName(args[1]);
      return name.ok ? { ok: true, params: { deviceId: args[0], displayName: name.value } } : bad(name.error);
    },
  });

  define({
    channel: 'dude:hub:owner:revokeDevicePreview', method: 'hub.owner.revokeDevicePreview',
    parse: (args) => (args.length === 1 && uuidArg(args[0]) ? { ok: true, params: { deviceId: args[0] } } : bad()),
  });

  define({
    channel: 'dude:hub:owner:revokeDevice', method: 'hub.owner.revokeDevice',
    parse: (args) => (args.length === 2 && uuidArg(args[0]) && tokenArg(args[1]) ? { ok: true, params: { deviceId: args[0], confirmToken: args[1] } } : bad()),
  });

  define({
    channel: 'dude:hub:owner:setRecoveryTrust', method: 'hub.owner.setRecoveryTrust',
    parse: (args) => (args.length === 3 && uuidArg(args[0]) && isString(args[1], 1, 1024) && typeof args[2] === 'boolean'
      ? { ok: true, params: { deviceId: args[0], password: args[1], trusted: args[2] } } : bad()),
  });

  define({ channel: 'dude:hub:owner:listSessions', method: 'hub.owner.listSessions', parse: none });

  define({
    channel: 'dude:hub:owner:revokeSession', method: 'hub.owner.revokeSession',
    parse: (args) => (args.length === 1 && typeof args[0] === 'string' && SESSION_ID.test(args[0]) ? { ok: true, params: { sessionId: args[0] } } : bad()),
  });

  define({ channel: 'dude:hub:owner:revokeAllPreview', method: 'hub.owner.revokeAllPreview', parse: none });

  define({
    channel: 'dude:hub:owner:revokeAll', method: 'hub.owner.revokeAll',
    parse: (args) => (args.length === 1 && tokenArg(args[0]) ? { ok: true, params: { confirmToken: args[0] } } : bad()),
  });

  define({
    channel: 'dude:hub:owner:listAudit', method: 'hub.owner.listAudit',
    parse: (args) => {
      if (args.length > 1) return bad();
      const [before] = args;
      if (before === undefined) return { ok: true, params: {} };
      return typeof before === 'number' && Number.isSafeInteger(before) && before >= 0 ? { ok: true, params: { beforeSeq: before } } : bad();
    },
  });

  define({ channel: 'dude:hub:owner:listSecurityAlerts', method: 'hub.owner.listSecurityAlerts', parse: none });

  define({
    channel: 'dude:hub:owner:markSecurityAlertsSeen', method: 'hub.owner.markSecurityAlertsSeen',
    parse: (args) => (args.length === 1 && typeof args[0] === 'number' && Number.isSafeInteger(args[0]) && args[0] >= 0 ? { ok: true, params: { upToSeq: args[0] } } : bad()),
  });

  define({ channel: 'dude:hub:owner:recoveryCodesPreview', method: 'hub.owner.recoveryCodesPreview', parse: none });

  define({
    channel: 'dude:hub:owner:regenerateRecoveryCodes', method: 'hub.owner.regenerateRecoveryCodes',
    parse: (args) => (args.length === 1 && tokenArg(args[0]) ? { ok: true, params: { confirmToken: args[0] } } : bad()),
  });

  define({
    channel: 'dude:hub:owner:changePassword', method: 'hub.owner.changePassword',
    parse: (args) => (args.length === 2 && isString(args[0], 1, 1024) && isString(args[1], 1, 1024)
      ? { ok: true, params: { currentPassword: args[0], newPassword: args[1] } } : bad()),
  });

  // Device-assisted owner recovery (PD-029): validate, then the user-presence gate (Hello/CredUI, a client-side UI gate the
  // Hub cannot verify), and only a verified person reaches the agent. One prompt at a time.
  let recovering = false;
  ipcMain.handle('dude:hub:recoverOwner', async (event, ...args: unknown[]): Promise<DesktopHubResult<{ readonly ok: true }>> => {
    if (!own(event.sender)) return fail(FORBIDDEN, 'forbidden');
    if (args.length !== 1 || !isString(args[0], 12, 1024)) return fail('bad-request', 'Invalid request.');
    const newPassword = args[0];
    const h = host();
    if (!h) return fail('unavailable', 'The device agent is not running.');
    if (window.isDestroyed()) return fail('unavailable', 'The window is not available.');
    if (recovering) return fail('busy', 'A confirmation is already in progress.');
    recovering = true;
    try {
      let outcome: Awaited<ReturnType<UserConsent>>;
      try {
        outcome = await consent(nativeHandleString(window.getNativeWindowHandle()), RECOVERY_CONSENT_MESSAGE);
      } catch {
        return fail('not-verified', 'Windows could not confirm it was you.');
      }
      if (outcome.status === 'unavailable') return fail('unavailable', 'Confirming your identity is not available on this device.');
      if (outcome.status !== 'verified') return fail('not-verified', `Windows did not confirm it was you (${outcome.reason}).`);
      try {
        await h.call('hub.recoverOwner', { newPassword });
        return { ok: true, result: { ok: true } };
      } catch (error) {
        if (error instanceof DeviceStoreError) return fail(error.code, error.message);
        return fail('internal', 'The Hub request failed.');
      }
    } finally {
      recovering = false;
    }
  });

  registerHubWebHandlers(window, host, hubWeb);
  registerLocalHubHandlers(window, host, localHub, { toStatus: toDesktopStatus, scrub: scrubCredentials });

  // Status pushes: the agent reports every Hub connection change; the renderer gets the same shape `status()` returns.
  host()?.onEvent?.((frame) => {
    if (frame.event !== 'hub.status') return;
    if (window.isDestroyed() || window.webContents.isDestroyed()) return;
    window.webContents.send('dude:hub:statusChanged', scrubCredentials(toDesktopStatus(frame.status)));
  });
}
