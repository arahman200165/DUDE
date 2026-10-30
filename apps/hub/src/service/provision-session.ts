import net from 'node:net';
import type { Duplex } from 'node:stream';
import { HUB_TUNNEL_PHRASE, hubTunnelDashboardLines } from '@dude/contracts/hub';
import type { HubTunnelDashboard } from '@dude/contracts/hub';
import { AdminCallError, HUB_NOT_RUNNING } from '../admin/admin-client.js';
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, defaultInstallDir, deleteFirewallRule, requireElevated, resolveDeps, serviceDataDir, serviceState, tryAdminStatus } from './common.js';
import type { ResolvedDeps, ServiceDeps } from './common.js';
import { runServiceControl } from './lifecycle.js';
import { auditNativeListeners } from './listeners.js';

/**
 * `dude-hub provision --session-pipe <name>` (32-SS1, Milestone 853, PD-153): ONE elevated session driven by the desktop provisioning wizard.
 *
 * Why a pipe and not standard input: Windows starts an elevated process through the shell (`Start-Process -Verb RunAs`), which cannot redirect the
 * new process's standard streams, so the desktop app (the un-elevated parent) listens on a random per-run named pipe and this process connects to it
 * and treats it as its standard input and output. That keeps every secret (the Cloudflare connector token, the backup passphrase, the Google client
 * secret) out of the command line, the environment and every file: it travels in one JSON line over a pipe that only this user and administrators can
 * open, straight into the admin call that stores it.
 *
 * The session is NOT a generic admin proxy. It serves a closed list of named operations (`PROVISION_SESSION_OPS`), each with its own strict parameter
 * check, and maps each to fixed admin methods; an unknown operation or parameter is refused without echoing it. The exposure-widening operation is
 * the same two steps the CLI has: `tunnel-preview` changes nothing and returns a single-use confirmation, and `tunnel-apply` needs that confirmation and
 * the exact typed phrase (checked here and again in the Hub). Nothing here decides for the owner: a refusal or a missing phrase is an error, never a
 * default. Errors carry the Hub's own value-free message and code; any other failure is a fixed sentence, so no parameter value can come back. Nothing
 * is logged by this module, and the session ends when the pipe closes (or after `idleMs` with no request).
 */
export const PROVISION_SESSION_OPS = [
  'status', 'provision', 'tunnel-preview', 'tunnel-apply', 'oidc', 'power-preview', 'power-apply', 'backup', 'standby-preview', 'standby-apply', 'restart',
] as const;
export type ProvisionSessionOp = (typeof PROVISION_SESSION_OPS)[number];

/** The pipe name the desktop creates: a prefix and 24 random bytes in base64url. It also keeps the pipe out of any directory path. */
export const PROVISION_SESSION_PIPE = /^dude-hub-provision-[A-Za-z0-9_-]{32}$/;
export const PROVISION_SESSION_LINE_MAX = 64 * 1024;
export const PROVISION_SESSION_IDLE_MS = 20 * 60_000;

const CALL_MS = 60_000;
const LONG_CALL_MS = 180_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOSTNAME_MAX = 253;

export interface ProvisionSessionOptions {
  pipeName: string;
  dataDir?: string;
  installDir?: string;
  /** Close after this long with no request (default 20 minutes). */
  idleMs?: number;
}

export interface ProvisionSessionDeps extends ServiceDeps {
  /** TEST seam: the stream the session reads requests from and writes answers to (default: the named pipe `\\.\pipe\<pipeName>`). */
  connect?: (pipeName: string) => Promise<Duplex>;
}

class Refusal extends Error {
  constructor(readonly code: string, message: string, readonly detail?: unknown) {
    super(message);
  }
}

const bad = (): Refusal => new Refusal('bad-request', 'The request is not valid.');
const record = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw bad();
  return value as Record<string, unknown>;
};
const exactly = (params: unknown, keys: readonly string[], optional: readonly string[] = []): Record<string, unknown> => {
  const input = record(params);
  for (const key of Object.keys(input)) if (!keys.includes(key) && !optional.includes(key)) throw bad();
  for (const key of keys) if (!(key in input)) throw bad();
  return input;
};
const text = (value: unknown, min: number, max: number): string => {
  if (typeof value !== 'string' || value.length < min || value.length > max) throw bad();
  return value;
};
const flag = (value: unknown): boolean => {
  if (typeof value !== 'boolean') throw bad();
  return value;
};

const asRecord = (value: unknown): Record<string, unknown> => (typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {});

interface ProvisionSessionContext { d: ResolvedDeps; dataRoot: string; installDir: string; deps: ProvisionSessionDeps }

async function hostFacts(c: ProvisionSessionContext): Promise<Record<string, unknown>> {
  const facts: Record<string, unknown> = {};
  if (c.d.platform === 'win32') {
    const audit = await auditNativeListeners(c.d.exec, c.d.platform);
    facts['nativeListeners'] = { exposed: audit.exposed, desktopLan: audit.desktopLan, partial: audit.partial };
  }
  return facts;
}

const call = (c: ProvisionSessionContext, method: string, params: unknown, timeoutMs = CALL_MS): Promise<unknown> => c.d.call(c.dataRoot, method, params, timeoutMs);

/** A read that may fail without failing the session: the status view shows what it could read. */
async function tolerant(c: ProvisionSessionContext, method: string): Promise<Record<string, unknown> | null> {
  try { return asRecord(await call(c, method, {})); } catch { return null; }
}

const confirmation = (preview: Record<string, unknown>): { confirmToken: unknown; expiresAt: unknown; consequenceClass: unknown } =>
  ({ confirmToken: preview['confirmToken'], expiresAt: preview['expiresAt'], consequenceClass: preview['consequenceClass'] });

type Handler = (c: ProvisionSessionContext, params: unknown) => Promise<unknown>;

const HANDLERS: Record<ProvisionSessionOp, Handler> = {
  async status(c, params) {
    exactly(params, []);
    const provisioned = asRecord(await call(c, 'provision.status', {}, 120_000));
    const [tunnel, power, backup] = await Promise.all([tolerant(c, 'network.tunnel.status'), tolerant(c, 'power.status'), tolerant(c, 'backup.schedule.status')]);
    return {
      provisioning: provisioned['report'],
      tunnel: tunnel === null ? null : { configured: tunnel['configured'] === true, hostname: tunnel['hostname'] ?? null, state: tunnel['state'] ?? null, tokenPresent: tunnel['tokenPresent'] === true, supported: tunnel['supported'] === true },
      power: power === null ? null : { verdict: power['verdict'] ?? null, sleepAcMinutes: power['sleepAcMinutes'] ?? null, hibernateAcMinutes: power['hibernateAcMinutes'] ?? null, applied: power['applied'] === true },
      backup: backup === null ? null : {
        configured: backup['configured'] === true, intervalHours: backup['intervalHours'] ?? null,
        destinations: Array.isArray(backup['destinations']) ? backup['destinations'].length : 0, keyPresent: backup['keyPresent'] === true,
      },
    };
  },

  async provision(c, params) {
    exactly(params, []);
    const run = asRecord(await call(c, 'provision.run', {}, 120_000));
    return { report: run['report'], created: run['created'] ?? [], restartRequired: run['restartRequired'] === true, failed: run['failed'] ?? [] };
  },

  async 'tunnel-preview'(c, params) {
    const input = exactly(params, ['hostname', 'acceptUnverifiedReachability']);
    const hostname = text(input['hostname'], 1, HOSTNAME_MAX);
    const accept = flag(input['acceptUnverifiedReachability']);
    const preview = asRecord(await call(c, 'network.tunnel.preview', { action: 'on', hostname, ...(accept ? { acceptUnverifiedReachability: true } : {}), hostFacts: await hostFacts(c) }));
    const summary = asRecord(preview['summary']);
    const dashboard = asRecord(summary['dashboard']) as unknown as HubTunnelDashboard;
    return {
      ...confirmation(preview), hostname: summary['hostname'] ?? hostname, requiredPhrase: preview['requiredPhrase'] ?? HUB_TUNNEL_PHRASE,
      dashboard, dashboardLines: hubTunnelDashboardLines(dashboard), disclosure: summary['disclosure'] ?? [],
      warnings: asRecord(preview['readiness'])['warnings'] ?? [], needsConnectorToken: summary['needsConnectorToken'] === true,
    };
  },

  async 'tunnel-apply'(c, params) {
    const input = exactly(params, ['hostname', 'confirmToken', 'acknowledgement', 'acceptUnverifiedReachability'], ['connectorToken']);
    const hostname = text(input['hostname'], 1, HOSTNAME_MAX);
    const confirmToken = text(input['confirmToken'], 1, 256);
    const acknowledgement = text(input['acknowledgement'], 0, 128);
    const accept = flag(input['acceptUnverifiedReachability']);
    const token = input['connectorToken'] === undefined ? undefined : text(input['connectorToken'], 32, 4096);
    // The same check the Hub makes, made first so a typo reaches no admin call at all.
    if (acknowledgement !== HUB_TUNNEL_PHRASE) throw new Refusal('refused', `To publish the Hub through Cloudflare, type the exact phrase "${HUB_TUNNEL_PHRASE}".`, { requiredPhrase: HUB_TUNNEL_PHRASE });
    const result = asRecord(await call(c, 'network.tunnel.apply', {
      action: 'on', hostname, confirmToken, acknowledgement, ...(accept ? { acceptUnverifiedReachability: true } : {}), hostFacts: await hostFacts(c), ...(token !== undefined ? { connectorToken: token } : {}),
    }, LONG_CALL_MS));
    const state = await serviceState(c.d);
    // The Hub listens on loopback only now; an absent LAN rule is fine (the same follow-up `dude-hub network tunnel on` makes).
    if (state !== 'not-installed' && state !== 'unknown') await deleteFirewallRule(c.d.exec).catch(() => undefined);
    const warnings = Array.isArray(result['warnings']) ? (result['warnings'] as unknown[]).filter((w) => typeof w === 'string' && w !== 'tunnel-edge-tls') : [];
    return { hostname, warnings, restartRequired: true };
  },

  async oidc(c, params) {
    const input = exactly(params, ['clientId', 'clientSecret', 'redirectOrigin']);
    const result = asRecord(await call(c, 'oidc.configure', { clientId: text(input['clientId'], 1, 256), clientSecret: text(input['clientSecret'], 1, 1024), redirectOrigin: text(input['redirectOrigin'], 1, 256) }));
    return { configured: result['configured'] === true, redirectOrigin: result['redirectOrigin'] ?? null, restartRequired: result['restartRequired'] === true };
  },

  async 'power-preview'(c, params) {
    exactly(params, []);
    const preview = asRecord(await call(c, 'power.preview', { action: 'apply' }));
    return { ...confirmation(preview), summary: preview['summary'] };
  },

  async 'power-apply'(c, params) {
    const input = exactly(params, ['confirmToken']);
    const result = asRecord(await call(c, 'power.apply', { confirmToken: text(input['confirmToken'], 1, 256) }, LONG_CALL_MS));
    return { verdict: result['verdict'] ?? null, before: result['before'] ?? null, after: result['after'] ?? null, commands: result['commands'] ?? [] };
  },

  async backup(c, params) {
    const input = exactly(params, ['folder', 'passphrase', 'intervalHours']);
    const intervalHours = input['intervalHours'];
    if (typeof intervalHours !== 'number' || !Number.isInteger(intervalHours) || intervalHours < 1 || intervalHours > 8760) throw bad();
    const result = asRecord(await call(c, 'backup.schedule.set', { intervalHours, folder: text(input['folder'], 1, 1024), passphrase: text(input['passphrase'], 1, 1024) }, LONG_CALL_MS));
    return { configured: result['configured'] === true, intervalHours: result['intervalHours'] ?? intervalHours, destinations: Array.isArray(result['destinations']) ? result['destinations'].length : 0, destinationAdded: typeof result['destinationAdded'] === 'string' };
  },

  async 'standby-preview'(c, params) {
    const input = exactly(params, ['deviceId']);
    const deviceId = text(input['deviceId'], 36, 36);
    if (!UUID.test(deviceId)) throw bad();
    const preview = asRecord(await call(c, 'standby.grant.preview', { deviceId }));
    return { ...confirmation(preview), summary: preview['summary'] };
  },

  async 'standby-apply'(c, params) {
    const input = exactly(params, ['deviceId', 'confirmToken']);
    const deviceId = text(input['deviceId'], 36, 36);
    if (!UUID.test(deviceId)) throw bad();
    const result = asRecord(await call(c, 'standby.grant.apply', { deviceId, confirmToken: text(input['confirmToken'], 1, 256) }));
    return { granted: result['granted'] === true, renewed: result['renewed'] === true };
  },

  async restart(c, params) {
    exactly(params, []);
    const quiet: ServiceDeps = { ...c.deps, stdout: () => undefined, stderr: () => undefined };
    const code = await runServiceControl('restart', { dataDir: c.dataRoot, installDir: c.installDir }, quiet);
    return { restarted: code === EXIT_OK };
  },
};

/** The error line for a failed operation: the Hub's own code and value-free message, else a fixed sentence. */
export function sessionError(error: unknown): { code: string; message: string; detail?: unknown } {
  if (error instanceof Refusal) return { code: error.code, message: error.message, ...(error.detail !== undefined ? { detail: error.detail } : {}) };
  if (error instanceof AdminCallError) {
    if (error.code === HUB_NOT_RUNNING) return { code: 'hub-not-running', message: 'The Hub is not running.' };
    return { code: error.code, message: error.message, ...(error.detail !== undefined && typeof error.detail === 'object' ? { detail: error.detail } : {}) };
  }
  return { code: 'internal', message: 'The step failed.' };
}

/** Serves the lines of `stream` until it ends, answers each, and resolves with the exit code. Exported for the specs. */
export function serveProvisionSession(stream: Duplex, context: ProvisionSessionContext, idleMs: number): Promise<number> {
  return new Promise<number>((resolve) => {
    let buffer = '';
    let chain: Promise<void> = Promise.resolve();
    let finished = false;
    let timer: NodeJS.Timeout | undefined;
    const finish = (code: number): void => {
      if (finished) return;
      finished = true;
      if (timer !== undefined) clearTimeout(timer);
      stream.destroy();
      resolve(code);
    };
    const arm = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => finish(EXIT_OK), idleMs);
      timer.unref();
    };
    const reply = (value: unknown): void => { if (!finished) stream.write(`${JSON.stringify(value)}\n`); };
    const handle = async (line: string): Promise<void> => {
      let id: unknown = null;
      try {
        let parsed: unknown;
        try { parsed = JSON.parse(line); } catch { throw bad(); }
        const request = record(parsed);
        id = request['id'];
        if (typeof id !== 'number' || !Number.isSafeInteger(id)) throw bad();
        const op = request['op'];
        if (typeof op !== 'string' || !(PROVISION_SESSION_OPS as readonly string[]).includes(op)) throw new Refusal('unknown-operation', 'That operation is not available in this session.');
        reply({ id, ok: true, result: await HANDLERS[op as ProvisionSessionOp](context, request['params'] ?? {}) });
      } catch (error) {
        reply({ id: typeof id === 'number' ? id : null, ok: false, error: sessionError(error) });
      }
    };
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => {
      buffer += chunk;
      if (buffer.length > PROVISION_SESSION_LINE_MAX * 2) { buffer = ''; reply({ id: null, ok: false, error: { code: 'bad-request', message: 'The request is too large.' } }); return; }
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line.length > 0 && line.length <= PROVISION_SESSION_LINE_MAX) {
          arm();
          chain = chain.then(() => handle(line));
        } else if (line.length > 0) reply({ id: null, ok: false, error: { code: 'bad-request', message: 'The request is too large.' } });
        newline = buffer.indexOf('\n');
      }
    });
    stream.on('end', () => { void chain.then(() => finish(EXIT_OK)); });
    stream.on('close', () => { void chain.then(() => finish(EXIT_OK)); });
    stream.on('error', () => finish(EXIT_FAILURE));
    arm();
  });
}

const connectPipe = (pipeName: string): Promise<Duplex> =>
  new Promise((resolve, reject) => {
    const socket = net.connect(`\\\\.\\pipe\\${pipeName}`);
    socket.once('connect', () => resolve(socket));
    socket.once('error', reject);
  });

/**
 * Runs the session: needs the elevated terminal and a running Hub, connects to the desktop's pipe and serves operations until it closes. Exit codes:
 * 0 the session ended normally, 1 the pipe could not be opened or broke, 2 usage, not elevated, or the Hub is not running (nothing is connected then,
 * so the desktop reports that the elevated command ended).
 */
export async function runProvisionSession(options: ProvisionSessionOptions, deps: ProvisionSessionDeps = {}): Promise<number> {
  const d = resolveDeps(deps);
  if (!PROVISION_SESSION_PIPE.test(options.pipeName)) {
    d.err('The session pipe name is not valid.\n');
    return EXIT_USAGE;
  }
  let dataRoot: string;
  try {
    dataRoot = serviceDataDir(options.dataDir, d);
  } catch (error) {
    d.err(`${(error as Error).message}\n`);
    return EXIT_USAGE;
  }
  const refused = await requireElevated(d, 'The provisioning session');
  if (refused !== null) return refused;
  if ((await tryAdminStatus(d, dataRoot)) === null) {
    d.err('The Hub is not running. Provisioning is done by the running Hub; start it and run this again.\n');
    return EXIT_USAGE;
  }
  let stream: Duplex;
  try {
    stream = await (deps.connect ?? connectPipe)(options.pipeName);
  } catch {
    d.err('The provisioning session could not connect to the desktop app.\n');
    return EXIT_FAILURE;
  }
  const context: ProvisionSessionContext = { d, dataRoot, installDir: options.installDir ?? defaultInstallDir(d.env), deps };
  return serveProvisionSession(stream, context, options.idleMs ?? PROVISION_SESSION_IDLE_MS);
}
