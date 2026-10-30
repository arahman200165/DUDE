import { randomBytes } from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import { dialog, ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import { HUB_TUNNEL_PHRASE } from '@dude/contracts/hub';
import type {
  DesktopHubResult, DesktopProvisionProgress, DesktopProvisionRequest, DesktopProvisionResultMap, DesktopProvisionStatus, DesktopProvisionStepId,
} from '@dude/contracts/shared/models/platform-bridge.model';
import { DeviceStoreError } from './agent-host';
import type { DeviceStoreHost } from './agent-host';
import { HUB_EXE, LOCAL_HUB_ERRORS, defaultExec, findHubInstall, runElevated } from './local-hub';
import type { LocalHubDeps } from './local-hub';

/**
 * The desktop Hub provisioning wizard's main side (32-SS1, Milestone 853, PD-153): `dude:hub:provisionOpen|provisionStep|provisionChooseBackupFolder|provisionClose`
 * and the `dude:hub:provisionProgress` push. Main is the trust boundary and the only place a credential-bearing value lives for a moment.
 *
 * ONE elevated session. `provisionOpen` creates a random per-run named pipe, UAC-elevates the INSTALLED `dude-hub.exe provision --session-pipe <name>`
 * (Windows starts an elevated process through the shell, which cannot redirect its standard input, so the pipe is the stdin) and talks to it in JSON
 * lines. The pipe name is the only thing on the command line: a Cloudflare connector token, a backup passphrase or a Google client secret goes into
 * ONE request line, never an argument, an environment variable or a file, and is not kept after it is sent. The Hub side serves a closed list of named
 * operations (`apps/hub/src/service/provision-session.ts`), so this module cannot reach any other admin method either.
 *
 * Steps that widen exposure or change a machine setting are two steps, and main enforces the order itself: an apply is accepted only for the
 * confirmation a preview of THIS session returned (same host name, 60 seconds, once), and the tunnel apply also needs the exact typed phrase, which
 * only the user can supply: nothing here fills it in. The renderer supplies no path (the backup folder is the one the user picked in the native
 * dialog here), no command and no admin method; every request is validated for shape and size before anything is sent. Errors carry a code and a
 * value-free message (any secret of the request is also redacted from them).
 */

export const PROVISION_ERRORS = {
  noSession: 'no-session', sessionFailed: 'session-failed', stalePreview: 'stale-preview', badRequest: 'bad-request', notEnrolled: 'not-enrolled', refused: 'refused',
} as const;

/** A confirmation is accepted for 60 seconds, the Hub's own lifetime; the Hub refuses an expired one again. */
export const PROVISION_CONFIRMATION_MS = 60_000;
/** Waiting for the person to answer the Windows administrator prompt. */
export const PROVISION_CONNECT_MS = 5 * 60_000;
/** An elevated session may outlive the 10-minute default of one-shot elevated commands; the Hub closes an idle one itself. */
export const PROVISION_SESSION_MS = 4 * 60 * 60_000;
const REQUEST_TIMEOUT_MS: Partial<Record<DesktopProvisionStepId, number>> = { provision: 150_000, 'tunnel-apply': 200_000, 'power-apply': 200_000, backup: 200_000, restart: 150_000 };
const DEFAULT_REQUEST_TIMEOUT_MS = 90_000;
const PIPE_NAME = /^dude-hub-provision-[A-Za-z0-9_-]{32}$/;

/** One accepted connection of the session pipe, as lines. */
export interface SessionSocket {
  write(line: string): void;
  onLine(callback: (line: string) => void): void;
  onClose(callback: () => void): void;
  close(): void;
}
export interface SessionChannel {
  /** Resolves with the first (and only) connection; the listener stops accepting after it. */
  accepted: Promise<SessionSocket>;
  close(): void;
}

export interface ProvisionDeps extends LocalHubDeps {
  /** Creates the listening pipe. */
  createChannel: (name: string) => Promise<SessionChannel>;
  /** The native folder dialog; the path it returns never leaves main except to be displayed. */
  pickFolder: (window: BrowserWindow) => Promise<string | null>;
  now: () => number;
  connectMs: number;
  sessionMs: number;
}

/** The default transport: a Node `net` server on `\\.\pipe\<name>` (the creating user and administrators only can write to it), closed after the first connection. */
export const createPipeChannel = (name: string): Promise<SessionChannel> =>
  new Promise((resolveChannel, rejectChannel) => {
    const server = net.createServer();
    let accept!: (socket: SessionSocket) => void;
    const accepted = new Promise<SessionSocket>((resolve) => { accept = resolve; });
    server.once('connection', (socket) => {
      server.close();
      socket.setEncoding('utf8');
      let buffer = '';
      let lineCallback: (line: string) => void = () => undefined;
      let closeCallback: () => void = () => undefined;
      socket.on('data', (chunk: string) => {
        buffer += chunk;
        if (buffer.length > 4 * 1024 * 1024) { socket.destroy(); return; }
        let newline = buffer.indexOf('\n');
        while (newline >= 0) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          if (line.trim().length > 0) lineCallback(line);
          newline = buffer.indexOf('\n');
        }
      });
      socket.on('close', () => closeCallback());
      socket.on('error', () => socket.destroy());
      accept({
        write: (line) => { socket.write(`${line}\n`); },
        onLine: (callback) => { lineCallback = callback; },
        onClose: (callback) => { closeCallback = callback; },
        close: () => { socket.destroy(); },
      });
    });
    server.once('error', rejectChannel);
    server.listen(`\\\\.\\pipe\\${name}`, () => {
      server.off('error', rejectChannel);
      resolveChannel({ accepted, close: () => { try { server.close(); } catch { /* already closed */ } } });
    });
  });

export const pickBackupFolder = async (window: BrowserWindow): Promise<string | null> => {
  const result = await dialog.showOpenDialog(window, { title: 'Choose the Hub backup folder', properties: ['openDirectory', 'createDirectory'] });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0] ?? null;
};

// ---- Request validation (renderer -> main) ----

const isString = (v: unknown, min: number, max: number): v is string => typeof v === 'string' && v.length >= min && v.length <= max;
const keysOf = (o: object, required: readonly string[], optional: readonly string[] = []): boolean =>
  Object.keys(o).every((k) => k === 'step' || required.includes(k) || optional.includes(k)) && required.every((k) => k in o);
const TOKEN_ID = /^[A-Za-z0-9_-]{1,256}$/;
const HOSTNAME = /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,250}[A-Za-z0-9])?$/;
const CONNECTOR_TOKEN = /^[A-Za-z0-9+/=_-]{32,4096}$/;

/** Strict, exact-shape validation of a wizard request. Returns the sanitized request (the connector token trimmed) or null. */
export function parseProvisionRequest(value: unknown): DesktopProvisionRequest | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  switch (o['step']) {
    case 'status': case 'provision': case 'power-preview': case 'standby-preview': case 'restart':
      return keysOf(o, []) ? ({ step: o['step'] } as DesktopProvisionRequest) : null;
    case 'tunnel-preview':
      return keysOf(o, ['hostname', 'acceptUnverifiedReachability']) && isString(o['hostname'], 1, 253) && HOSTNAME.test(o['hostname']) && typeof o['acceptUnverifiedReachability'] === 'boolean'
        ? { step: 'tunnel-preview', hostname: o['hostname'].toLowerCase(), acceptUnverifiedReachability: o['acceptUnverifiedReachability'] } : null;
    case 'tunnel-apply': {
      if (!keysOf(o, ['hostname', 'confirmToken', 'acknowledgement', 'acceptUnverifiedReachability'], ['connectorToken'])) return null;
      if (!isString(o['hostname'], 1, 253) || !HOSTNAME.test(o['hostname']) || !isString(o['confirmToken'], 1, 256) || !TOKEN_ID.test(o['confirmToken'])) return null;
      if (!isString(o['acknowledgement'], 0, 128) || typeof o['acceptUnverifiedReachability'] !== 'boolean') return null;
      let connectorToken: string | undefined;
      if (o['connectorToken'] !== undefined) {
        if (typeof o['connectorToken'] !== 'string') return null;
        connectorToken = o['connectorToken'].trim();
        if (!CONNECTOR_TOKEN.test(connectorToken)) return null;
      }
      return {
        step: 'tunnel-apply', hostname: o['hostname'].toLowerCase(), confirmToken: o['confirmToken'], acknowledgement: o['acknowledgement'],
        acceptUnverifiedReachability: o['acceptUnverifiedReachability'], ...(connectorToken !== undefined ? { connectorToken } : {}),
      };
    }
    case 'oidc':
      return keysOf(o, ['clientId', 'clientSecret', 'redirectOrigin']) && isString(o['clientId'], 1, 256) && !/\s/u.test(o['clientId']) && isString(o['clientSecret'], 8, 512)
        && isString(o['redirectOrigin'], 1, 256) ? { step: 'oidc', clientId: o['clientId'], clientSecret: o['clientSecret'], redirectOrigin: o['redirectOrigin'] } : null;
    case 'power-apply': case 'standby-apply':
      return keysOf(o, ['confirmToken']) && isString(o['confirmToken'], 1, 256) && TOKEN_ID.test(o['confirmToken']) ? ({ step: o['step'], confirmToken: o['confirmToken'] } as DesktopProvisionRequest) : null;
    case 'backup': {
      const hours = o['intervalHours'];
      return keysOf(o, ['passphrase', 'intervalHours']) && isString(o['passphrase'], 1, 1024) && typeof hours === 'number' && Number.isInteger(hours) && hours >= 1 && hours <= 8760
        ? { step: 'backup', passphrase: o['passphrase'], intervalHours: hours } : null;
    }
    default:
      return null;
  }
}

// ---- Result shaping (session -> renderer): only the expected fields cross ----

const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const malformed = (): DeviceStoreError => new DeviceStoreError(PROVISION_ERRORS.sessionFailed, 'The elevated session answered in a way this app does not understand.');

function confirmation(r: Record<string, unknown>): { confirmToken: string; expiresAt: string; consequenceClass: string[] } {
  if (typeof r['confirmToken'] !== 'string' || !TOKEN_ID.test(r['confirmToken'])) throw malformed();
  return { confirmToken: r['confirmToken'], expiresAt: str(r['expiresAt']), consequenceClass: strings(r['consequenceClass']) };
}

/** The shaping of each step's answer. A secret never appears in a result, but the shape is closed anyway. */
const SHAPE = {
  tunnelPreview(raw: unknown, hostname: string): DesktopProvisionResultMap['tunnel-preview'] {
    const r = obj(raw);
    const d = obj(r['dashboard']);
    return {
      ...confirmation(r), hostname: str(r['hostname'], hostname), requiredPhrase: str(r['requiredPhrase'], HUB_TUNNEL_PHRASE),
      dashboard: { hostname: str(d['hostname'], hostname), service: str(d['service']), noTlsVerify: d['noTlsVerify'] === true, httpHostHeader: null },
      dashboardLines: strings(r['dashboardLines']), disclosure: strings(r['disclosure']),
      warnings: (Array.isArray(r['warnings']) ? r['warnings'] : []).map((w) => ({ id: str(obj(w)['id']), reason: str(obj(w)['reason']), fix: str(obj(w)['fix']) })),
      needsConnectorToken: r['needsConnectorToken'] === true,
    };
  },
  powerPreview(raw: unknown): DesktopProvisionResultMap['power-preview'] {
    const r = obj(raw);
    const s = obj(r['summary']);
    const minutes = (v: unknown): { sleepAcMinutes: number | null; hibernateAcMinutes: number | null } => ({ sleepAcMinutes: num(obj(v)['sleepAcMinutes']), hibernateAcMinutes: num(obj(v)['hibernateAcMinutes']) });
    return { ...confirmation(r), summary: { scope: str(s['scope']), before: minutes(s['before']), after: minutes(s['after']), commands: strings(s['commands']), why: str(s['why']), revertWith: strOrNull(s['revertWith']) } };
  },
  standbyPreview(raw: unknown): DesktopProvisionResultMap['standby-preview'] {
    const r = obj(raw);
    const s = obj(r['summary']);
    return { ...confirmation(r), summary: { deviceId: str(s['deviceId']), displayName: strOrNull(s['displayName']), alreadyGranted: s['alreadyGranted'] === true, repositories: num(s['repositories']) ?? 0, serves: str(s['serves']) } };
  },
  status(raw: unknown, deviceId: string | null): DesktopProvisionStatus {
    const r = obj(raw);
    if (typeof obj(r['provisioning'])['overall'] !== 'string') throw malformed();
    const t = r['tunnel'] === null ? null : obj(r['tunnel']);
    const p = r['power'] === null ? null : obj(r['power']);
    const b = r['backup'] === null ? null : obj(r['backup']);
    return {
      provisioning: r['provisioning'] as DesktopProvisionStatus['provisioning'],
      tunnel: t === null ? null : { configured: t['configured'] === true, hostname: strOrNull(t['hostname']), state: strOrNull(t['state']), tokenPresent: t['tokenPresent'] === true, supported: t['supported'] === true },
      power: p === null ? null : { verdict: strOrNull(p['verdict']), sleepAcMinutes: num(p['sleepAcMinutes']), hibernateAcMinutes: num(p['hibernateAcMinutes']), applied: p['applied'] === true },
      backup: b === null ? null : { configured: b['configured'] === true, intervalHours: num(b['intervalHours']), destinations: num(b['destinations']) ?? 0, keyPresent: b['keyPresent'] === true },
      deviceId,
    };
  },
};

const REDACTED = '[removed]';
/** The values of a request that must never appear in an error: every secret field, whole and trimmed. */
function secretsOf(request: DesktopProvisionRequest): string[] {
  const values: string[] = [];
  if (request.step === 'tunnel-apply' && request.connectorToken !== undefined) values.push(request.connectorToken);
  if (request.step === 'oidc') values.push(request.clientSecret);
  if (request.step === 'backup') values.push(request.passphrase);
  return values.filter((v) => v.length >= 4);
}
const redact = (text: string, secrets: readonly string[]): string => secrets.reduce((out, secret) => out.split(secret).join(REDACTED), text);

/** One sentence of the readiness blockers a refused tunnel preview carries (their ids and reasons are public text, never a secret). */
function refusalText(message: string, detail: unknown): string {
  const blockers = Array.isArray(obj(detail)['blockers']) ? (obj(detail)['blockers'] as unknown[]) : [];
  const reasons = blockers.map((b) => str(obj(b)['reason'])).filter((r) => r.length > 0).slice(0, 6);
  return reasons.length > 0 ? `${message} ${reasons.join(' ')}` : message;
}

interface PendingSession {
  socket: SessionSocket;
  nextId: number;
  waiting: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>;
  closed: boolean;
}

export interface ProvisionController {
  open(): Promise<DesktopProvisionStatus>;
  step<S extends DesktopProvisionStepId>(request: Extract<DesktopProvisionRequest, { step: S }>): Promise<DesktopProvisionResultMap[S]>;
  chooseBackupFolder(): Promise<{ canceled: boolean; folder: string | null }>;
  close(reason?: 'window-closed' | 'ended'): { closed: boolean };
  /** TEST: whether a session is open. */
  isOpen(): boolean;
}

export function createProvisionController(
  window: BrowserWindow, host: () => DeviceStoreHost | null, deps: ProvisionDeps, send: (progress: DesktopProvisionProgress) => void,
): ProvisionController {
  let session: PendingSession | null = null;
  let opening = false;
  let stepping = false;
  let backupFolder: string | null = null;
  let channel: SessionChannel | null = null;
  const pending: { tunnel?: { token: string; hostname: string; accept: boolean; at: number }; power?: { token: string; at: number }; standby?: { token: string; deviceId: string; at: number } } = {};

  const emit = (progress: DesktopProvisionProgress): void => { try { send(progress); } catch { /* the window is gone */ } };
  const forget = (): void => { delete pending.tunnel; delete pending.power; delete pending.standby; };
  const fresh = (at: number): boolean => deps.now() - at <= PROVISION_CONFIRMATION_MS;

  const endSession = (reason: 'ended' | 'idle' | 'cancelled' | 'failed' | 'window-closed'): boolean => {
    channel?.close();
    channel = null;
    const had = session;
    session = null;
    forget();
    backupFolder = null;
    if (had === null) return false;
    had.closed = true;
    for (const w of had.waiting.values()) { clearTimeout(w.timer); w.reject(new DeviceStoreError(PROVISION_ERRORS.noSession, 'The elevated session ended.')); }
    had.waiting.clear();
    had.socket.close();
    emit({ kind: 'session', state: 'closed', reason });
    return true;
  };

  const request = (op: DesktopProvisionStepId, params: Record<string, unknown>, secrets: readonly string[], timeoutMs: number): Promise<unknown> => {
    const s = session;
    if (s === null || s.closed) return Promise.reject(new DeviceStoreError(PROVISION_ERRORS.noSession, 'There is no open elevated session. Start the wizard again.'));
    const id = s.nextId++;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        s.waiting.delete(id);
        reject(new DeviceStoreError('timeout', 'The Hub did not answer in time. It may still be working; read the status before trying again.'));
      }, timeoutMs);
      s.waiting.set(id, {
        timer,
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
      // The one place a secret leaves this process: a JSON line on the session pipe.
      s.socket.write(JSON.stringify({ id, op, params }));
    }).catch((error: unknown) => {
      if (error instanceof DeviceStoreError) throw new DeviceStoreError(error.code, redact(error.message, secrets));
      throw error;
    });
  };

  const onLine = (line: string): void => {
    const s = session;
    if (s === null) return;
    let reply: Record<string, unknown>;
    try { reply = obj(JSON.parse(line)); } catch { return; }
    const id = reply['id'];
    const waiter = typeof id === 'number' ? s.waiting.get(id) : undefined;
    if (waiter === undefined || typeof id !== 'number') return;
    s.waiting.delete(id);
    if (reply['ok'] === true) { waiter.resolve(reply['result']); return; }
    const error = obj(reply['error']);
    const code = str(error['code'], 'internal');
    waiter.reject(new DeviceStoreError(code, refusalText(str(error['message'], 'The step failed.'), error['detail'])));
  };

  const agentDeviceId = async (): Promise<string | null> => {
    const h = host();
    if (!h) return null;
    try { return (await h.call('standby.status', {})).deviceId; } catch { return null; }
  };

  const readStatus = async (): Promise<DesktopProvisionStatus> => SHAPE.status(await request('status', {}, [], 120_000), await agentDeviceId());

  const open = async (): Promise<DesktopProvisionStatus> => {
    if (deps.platform !== 'win32') throw new DeviceStoreError(LOCAL_HUB_ERRORS.unsupportedPlatform, 'The Hub provisioning wizard is only available on Windows.');
    if (!host()) throw new DeviceStoreError('unavailable', 'The device agent is not running.');
    if (session !== null && !session.closed) return readStatus();
    if (opening) throw new DeviceStoreError(LOCAL_HUB_ERRORS.busy, 'The wizard is already starting.');
    opening = true;
    try {
      const installDir = await findHubInstall(deps);
      if (installDir === null) throw new DeviceStoreError(LOCAL_HUB_ERRORS.notInstalled, 'The DUDE Hub is not installed on this PC.');
      const dataDir = path.win32.join(Object.entries(deps.env).find(([k]) => k.toLowerCase() === 'programdata')?.[1] ?? 'C:\\ProgramData', 'DUDE', 'Hub');
      const name = `dude-hub-provision-${deps.randomBytes(24).toString('base64url')}`;
      if (!PIPE_NAME.test(name)) throw new DeviceStoreError(PROVISION_ERRORS.sessionFailed, 'The elevated session could not be prepared.');
      let created: SessionChannel;
      try { created = await deps.createChannel(name); } catch { throw new DeviceStoreError(PROVISION_ERRORS.sessionFailed, 'The elevated session could not be prepared.'); }
      channel = created;
      emit({ kind: 'session', state: 'waiting-for-administrator' });

      // The elevated process runs for the whole session, so this promise settles when it ends (or the person declines the prompt).
      const ended = runElevated(deps.exec, path.win32.join(installDir, HUB_EXE), ['provision', '--session-pipe', name, '--data-dir', dataDir, '--install-dir', installDir], deps.sessionMs);
      let timer: NodeJS.Timeout | undefined;
      const outcome = await Promise.race([
        created.accepted.then((socket) => ({ socket })),
        ended.then(() => ({ error: new DeviceStoreError(PROVISION_ERRORS.sessionFailed, 'The elevated command ended before it connected. Is the Hub service running?') }), (error: unknown) => ({ error })),
        new Promise<{ error: Error }>((resolve) => { timer = setTimeout(() => resolve({ error: new DeviceStoreError(PROVISION_ERRORS.sessionFailed, 'The administrator prompt was not answered in time.') }), deps.connectMs); }),
      ]);
      if (timer !== undefined) clearTimeout(timer);
      if ('error' in outcome) {
        created.close();
        channel = null;
        const error = outcome.error;
        const cancelled = error instanceof DeviceStoreError && error.code === LOCAL_HUB_ERRORS.elevationCancelled;
        emit({ kind: 'session', state: 'closed', reason: cancelled ? 'cancelled' : 'failed' });
        throw error instanceof DeviceStoreError && error.code === 'command-failed'
          ? new DeviceStoreError(PROVISION_ERRORS.sessionFailed, 'The elevated command failed to start the session. Is the Hub service running and are you an administrator?')
          : error;
      }
      const s: PendingSession = { socket: outcome.socket, nextId: 1, waiting: new Map(), closed: false };
      session = s;
      s.socket.onLine(onLine);
      s.socket.onClose(() => { if (session === s) endSession('ended'); });
      void ended.then(() => { if (session === s) endSession('ended'); }, () => { if (session === s) endSession('failed'); });
      emit({ kind: 'session', state: 'open' });
      try {
        return await readStatus();
      } catch (error) {
        endSession('failed');
        throw error;
      }
    } finally {
      opening = false;
    }
  };

  const spend = <K extends keyof typeof pending>(key: K): void => { delete pending[key]; };

  const run = async (req: DesktopProvisionRequest): Promise<unknown> => {
    const secrets = secretsOf(req);
    const call = (op: DesktopProvisionStepId, params: Record<string, unknown>): Promise<unknown> => request(op, params, secrets, REQUEST_TIMEOUT_MS[req.step] ?? DEFAULT_REQUEST_TIMEOUT_MS);
    switch (req.step) {
      case 'status': return readStatus();
      case 'provision': {
        const r = obj(await call('provision', {}));
        if (typeof obj(r['report'])['overall'] !== 'string') throw malformed();
        return { report: r['report'], created: strings(r['created']), restartRequired: r['restartRequired'] === true, failed: strings(r['failed']) };
      }
      case 'tunnel-preview': {
        const shaped = SHAPE.tunnelPreview(await call('tunnel-preview', { hostname: req.hostname, acceptUnverifiedReachability: req.acceptUnverifiedReachability }), req.hostname);
        pending.tunnel = { token: shaped.confirmToken, hostname: req.hostname, accept: req.acceptUnverifiedReachability, at: deps.now() };
        return shaped;
      }
      case 'tunnel-apply': {
        const p = pending.tunnel;
        if (!p || !fresh(p.at) || p.token !== req.confirmToken || p.hostname !== req.hostname || p.accept !== req.acceptUnverifiedReachability) {
          spend('tunnel');
          throw new DeviceStoreError(PROVISION_ERRORS.stalePreview, 'The preview is missing, expired or for different values. Preview again.');
        }
        // Only the user can type this; a mismatch keeps the preview so a typo can be corrected within its lifetime.
        if (req.acknowledgement !== HUB_TUNNEL_PHRASE) throw new DeviceStoreError(PROVISION_ERRORS.refused, `To publish the Hub through Cloudflare, type the exact phrase "${HUB_TUNNEL_PHRASE}".`);
        try {
          const r = obj(await call('tunnel-apply', {
            hostname: req.hostname, confirmToken: req.confirmToken, acknowledgement: req.acknowledgement, acceptUnverifiedReachability: req.acceptUnverifiedReachability,
            ...(req.connectorToken !== undefined ? { connectorToken: req.connectorToken } : {}),
          }));
          spend('tunnel');
          return { hostname: str(r['hostname'], req.hostname), warnings: strings(r['warnings']), restartRequired: true };
        } catch (error) {
          // The Hub spends the confirmation once past its cheap checks; keep the preview only for the errors it raises before that.
          if (!(error instanceof DeviceStoreError) || (error.code !== PROVISION_ERRORS.refused && error.code !== PROVISION_ERRORS.badRequest)) spend('tunnel');
          throw error;
        }
      }
      case 'oidc': {
        const r = obj(await call('oidc', { clientId: req.clientId, clientSecret: req.clientSecret, redirectOrigin: req.redirectOrigin }));
        return { configured: r['configured'] === true, redirectOrigin: strOrNull(r['redirectOrigin']), restartRequired: r['restartRequired'] === true };
      }
      case 'power-preview': {
        const shaped = SHAPE.powerPreview(await call('power-preview', {}));
        pending.power = { token: shaped.confirmToken, at: deps.now() };
        return shaped;
      }
      case 'power-apply': {
        const p = pending.power;
        if (!p || !fresh(p.at) || p.token !== req.confirmToken) { spend('power'); throw new DeviceStoreError(PROVISION_ERRORS.stalePreview, 'The preview is missing, expired or already used. Preview again.'); }
        spend('power');
        const r = obj(await call('power-apply', { confirmToken: req.confirmToken }));
        return { verdict: strOrNull(r['verdict']), commands: strings(r['commands']) };
      }
      case 'backup': {
        if (backupFolder === null) throw new DeviceStoreError(PROVISION_ERRORS.badRequest, 'Choose the backup folder first.');
        const r = obj(await call('backup', { folder: backupFolder, passphrase: req.passphrase, intervalHours: req.intervalHours }));
        return { configured: r['configured'] === true, intervalHours: num(r['intervalHours']) ?? req.intervalHours, destinations: num(r['destinations']) ?? 0, destinationAdded: r['destinationAdded'] === true };
      }
      case 'standby-preview': {
        const deviceId = await agentDeviceId();
        if (deviceId === null) throw new DeviceStoreError(PROVISION_ERRORS.notEnrolled, 'This desktop is not connected to a Hub yet, so it has no device id to grant.');
        const shaped = SHAPE.standbyPreview(await call('standby-preview', { deviceId }));
        pending.standby = { token: shaped.confirmToken, deviceId, at: deps.now() };
        return shaped;
      }
      case 'standby-apply': {
        const p = pending.standby;
        if (!p || !fresh(p.at) || p.token !== req.confirmToken) { spend('standby'); throw new DeviceStoreError(PROVISION_ERRORS.stalePreview, 'The preview is missing, expired or already used. Preview again.'); }
        spend('standby');
        const r = obj(await call('standby-apply', { deviceId: p.deviceId, confirmToken: req.confirmToken }));
        return { granted: r['granted'] === true, renewed: r['renewed'] === true };
      }
      case 'restart': {
        const r = obj(await call('restart', {}));
        // The restart takes the admin pipe with it: the session is over whatever the answer.
        endSession('ended');
        return { restarted: r['restarted'] === true };
      }
    }
  };

  return {
    open,
    async step(req: DesktopProvisionRequest) {
      if (stepping) throw new DeviceStoreError(LOCAL_HUB_ERRORS.busy, 'Another wizard step is running.');
      stepping = true;
      emit({ kind: 'step', step: req.step, state: 'running' });
      try {
        const result = await run(req);
        emit({ kind: 'step', step: req.step, state: 'done' });
        return result as never;
      } catch (error) {
        emit({ kind: 'step', step: req.step, state: 'failed' });
        throw error;
      } finally {
        stepping = false;
      }
    },
    async chooseBackupFolder() {
      if (session === null || session.closed) throw new DeviceStoreError(PROVISION_ERRORS.noSession, 'There is no open elevated session. Start the wizard again.');
      const folder = await deps.pickFolder(window);
      if (folder === null) return { canceled: true, folder: backupFolder };
      backupFolder = folder;
      return { canceled: false, folder };
    },
    close: (reason = 'ended') => ({ closed: endSession(reason) }),
    isOpen: () => session !== null && !session.closed,
  };
}

const fail = (code: string, message: string): DesktopHubResult<never> => ({ ok: false, error: { code, message } });

export function registerProvisionHandlers(
  window: BrowserWindow, host: () => DeviceStoreHost | null, overrides: Partial<ProvisionDeps>, scrub: <T>(value: T) => T,
): ProvisionController {
  const deps: ProvisionDeps = {
    platform: process.platform, env: process.env, isPackaged: () => false, resourcesPath: () => '', appVersion: () => '', exists: () => false, exec: defaultExec,
    randomBytes, updateWaitMs: 0, sleep: async () => undefined, createChannel: createPipeChannel, pickFolder: pickBackupFolder, now: Date.now,
    connectMs: PROVISION_CONNECT_MS, sessionMs: PROVISION_SESSION_MS, ...overrides,
  };
  const controller = createProvisionController(window, host, deps, (progress) => {
    if (window.isDestroyed() || window.webContents.isDestroyed()) return;
    window.webContents.send('dude:hub:provisionProgress', progress);
  });
  window.once?.('closed', () => { controller.close('window-closed'); });
  const own = (sender: unknown): boolean => sender === window.webContents;

  const guarded = async <R>(sender: unknown, valid: boolean, run: () => Promise<R>): Promise<DesktopHubResult<R>> => {
    if (!own(sender)) return fail('forbidden', 'forbidden');
    if (!valid) return fail(PROVISION_ERRORS.badRequest, 'Invalid request.');
    try {
      return { ok: true, result: scrub(await run()) };
    } catch (error) {
      if (error instanceof DeviceStoreError) return fail(error.code, error.message);
      return fail('internal', 'The provisioning request failed.');
    }
  };

  ipcMain.handle('dude:hub:provisionOpen', (event, ...args: unknown[]) => guarded(event.sender, args.length === 0, () => controller.open()));
  ipcMain.handle('dude:hub:provisionStep', (event, ...args: unknown[]) => {
    const parsed = args.length === 1 ? parseProvisionRequest(args[0]) : null;
    return guarded(event.sender, parsed !== null, () => controller.step(parsed as DesktopProvisionRequest as never));
  });
  ipcMain.handle('dude:hub:provisionChooseBackupFolder', (event, ...args: unknown[]) => guarded(event.sender, args.length === 0, () => controller.chooseBackupFolder()));
  ipcMain.handle('dude:hub:provisionClose', (event, ...args: unknown[]) => guarded(event.sender, args.length === 0, async () => controller.close('ended')));
  return controller;
}

