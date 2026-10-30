import type { DesktopProvisionProgress } from '@dude/contracts/shared/models/platform-bridge.model';
import { createProvisionController } from './hub-provision';
import type { ProvisionDeps, SessionChannel, SessionSocket } from './hub-provision';
import type { DeviceStoreHost } from './agent-host';

export const SECRET_TOKEN = 'eyJhIjoiMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWYiLCJ0IjoiMTExMTExMTEtMjIyMi0zMzMzLTQ0NDQtNTU1NTU1NTU1NTU1IiwicyI6InNlY3JldCJ9';
export const SECRET_PASSPHRASE = 'correct horse battery staple 42';
export const SECRET_CLIENT = 'GOCSPX-abcdefghijklmnop1234567890';
export const SECRETS = [SECRET_TOKEN, SECRET_PASSPHRASE, SECRET_CLIENT];
export const DEVICE_ID = '11111111-2222-4333-8444-555555555555';
export const PHRASE = 'EXPOSE HUB THROUGH CLOUDFLARE';
export const HOST = 'notes.example.com';

export interface Sent { id: number; op: string; params: Record<string, unknown> }
export interface Elevated { file: string; args: readonly string[]; env: Record<string, string> | undefined }

export interface Scenario {
  /** What the elevated Hub session answers per operation (a function may throw an `{ code, message, detail }` error object). */
  serve?: (op: string, params: Record<string, unknown>) => unknown;
  /** The elevated process exits with this code instead of connecting (UAC declined is 1223). */
  exitWithoutConnecting?: number;
  platform?: NodeJS.Platform;
  hasHost?: boolean;
  deviceId?: string | null;
  connectMs?: number;
}

export class SessionError {
  constructor(readonly code: string, readonly message: string, readonly detail?: unknown) {}
}

const OK_REPORT = { overall: 'ready', checkedAt: '2026-10-29T12:00:00.000Z', lastRun: null, components: [], secrets: [], commands: [] };

export function defaultServe(op: string, params: Record<string, unknown>): unknown {
  switch (op) {
    case 'status':
      return { provisioning: OK_REPORT, tunnel: { configured: false, hostname: null, state: 'not-configured', tokenPresent: false, supported: true }, power: { verdict: 'needs-change', sleepAcMinutes: 30, hibernateAcMinutes: 180, applied: false }, backup: { configured: false, intervalHours: null, destinations: 0, keyPresent: false } };
    case 'provision': return { report: OK_REPORT, created: ['storage'], restartRequired: false, failed: [] };
    case 'tunnel-preview':
      return {
        confirmToken: 'tok-tunnel', expiresAt: 'later', consequenceClass: ['system-config', 'process-management', 'secret-management'], hostname: params['hostname'], requiredPhrase: PHRASE,
        dashboard: { hostname: params['hostname'], service: 'https://127.0.0.1:47600', noTlsVerify: true, httpHostHeader: null }, dashboardLines: ['Public hostname: x', 'TLS: No TLS Verify = on'],
        disclosure: ['Cloudflare can read the traffic.'], warnings: [{ id: 'tunnel-edge-tls', reason: 'r', fix: 'f' }], needsConnectorToken: true,
      };
    case 'tunnel-apply': return { hostname: params['hostname'], warnings: [], restartRequired: true };
    case 'oidc': return { configured: true, redirectOrigin: params['redirectOrigin'], restartRequired: true };
    case 'power-preview': return { confirmToken: 'tok-power', expiresAt: 'later', consequenceClass: ['system-config'], summary: { scope: 'AC', before: { sleepAcMinutes: 30, hibernateAcMinutes: 180 }, after: { sleepAcMinutes: 0, hibernateAcMinutes: 0 }, commands: ['powercfg /change standby-timeout-ac 0'], why: 'w', revertWith: 'dude-hub power revert', extra: 'dropped' } };
    case 'power-apply': return { verdict: 'ok', commands: ['powercfg ...'], before: { x: 1 } };
    case 'backup': return { configured: true, intervalHours: params['intervalHours'], destinations: ['d-1'].length, destinationAdded: true };
    case 'standby-preview': return { confirmToken: 'tok-standby', expiresAt: 'later', consequenceClass: ['network-config'], summary: { deviceId: params['deviceId'], displayName: 'This PC', alreadyGranted: false, repositories: 1, serves: 's' } };
    case 'standby-apply': return { granted: true, renewed: false };
    case 'restart': return { restarted: true };
    default: throw new SessionError('unknown-operation', 'That operation is not available in this session.');
  }
}

/** A fake elevated Hub session behind a fake pipe, a fake UAC and a fake Device Agent: the controller runs for real, nothing else does. */
export function setupProvision(scenario: Scenario = {}) {
  const sent: Sent[] = [];
  const raw: string[] = [];
  const elevated: Elevated[] = [];
  const progress: DesktopProvisionProgress[] = [];
  const agentCalls: string[] = [];
  const clock = { t: 1_000_000 };
  const state = { channelClosed: false, socketClosed: false, picked: 'D:\\Hub backups' as string | null };
  let lineCallback: (line: string) => void = () => undefined;
  let closeCallback: () => void = () => undefined;
  let accept!: (socket: SessionSocket) => void;
  let endElevated!: (code: number) => void;

  const socket: SessionSocket = {
    write: (line) => {
      raw.push(line);
      const request = JSON.parse(line) as Sent;
      sent.push(request);
      void (async () => {
        try {
          const custom = await scenario.serve?.(request.op, request.params);
          const result = custom !== undefined ? custom : defaultServe(request.op, request.params);
          lineCallback(JSON.stringify({ id: request.id, ok: true, result }));
        } catch (error) {
          const e = error instanceof SessionError ? error : new SessionError('internal', 'The step failed.');
          lineCallback(JSON.stringify({ id: request.id, ok: false, error: { code: e.code, message: e.message, ...(e.detail !== undefined ? { detail: e.detail } : {}) } }));
        }
      })();
    },
    onLine: (cb) => { lineCallback = cb; },
    onClose: (cb) => { closeCallback = cb; },
    close: () => { state.socketClosed = true; },
  };
  const channel: SessionChannel = {
    accepted: new Promise<SessionSocket>((resolve) => { accept = resolve; }),
    close: () => { state.channelClosed = true; },
  };
  const exec: ProvisionDeps['exec'] = (file, args, options) => {
    if (file === 'reg.exe') return Promise.resolve({ stdout: '', code: 1 });
    elevated.push({ file, args, env: options?.env });
    if (scenario.exitWithoutConnecting !== undefined) return Promise.resolve({ stdout: '', code: scenario.exitWithoutConnecting });
    queueMicrotask(() => accept(socket));
    return new Promise((resolve) => { endElevated = (code) => resolve({ stdout: '', code }); });
  };
  const host = scenario.hasHost === false ? null : ({
    call: async (method: string) => {
      agentCalls.push(method);
      if (method === 'standby.status') return { deviceId: scenario.deviceId === undefined ? DEVICE_ID : scenario.deviceId };
      return {};
    },
  } as unknown as DeviceStoreHost);
  const deps: ProvisionDeps = {
    platform: scenario.platform ?? 'win32', env: { ProgramFiles: 'C:\\Program Files', ProgramData: 'C:\\ProgramData' }, isPackaged: () => true, resourcesPath: () => 'C:\\r', appVersion: () => '1.0.0',
    exists: (f) => /dude-hub\.exe$/.test(f), exec, randomBytes: (n) => Buffer.alloc(n, 1), updateWaitMs: 0, sleep: async () => undefined,
    createChannel: async () => channel, pickFolder: async () => state.picked, now: () => clock.t, connectMs: scenario.connectMs ?? 5_000, sessionMs: 60_000,
  };
  const window = { isDestroyed: () => false, webContents: { isDestroyed: () => false, send: () => undefined } } as never;
  const controller = createProvisionController(window, () => host, deps, (p) => { progress.push(p); });
  return {
    controller, deps, sent, raw, elevated, progress, agentCalls, clock, state, channel,
    /** What the elevated process or the pipe would do on their own. */
    hubEnds: () => { closeCallback(); },
    exitElevated: (code = 0) => endElevated(code),
    ops: (): string[] => sent.map((s) => s.op),
  };
}
