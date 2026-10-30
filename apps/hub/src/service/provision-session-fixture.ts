import { createInterface } from 'node:readline';
import { Duplex, PassThrough } from 'node:stream';
import { HUB_TUNNEL_PHRASE } from '@dude/contracts/hub';
import { runProvisionSession } from './provision-session.js';
import type { ProvisionSessionDeps } from './provision-session.js';
import { fixture } from './test-helpers.js';

export const SESSION_PIPE = `dude-hub-provision-${'A'.repeat(32)}`;
export const SESSION_HOST = 'notes.example.com';
export const SESSION_DEVICE = '11111111-2222-4333-8444-555555555555';
export const SESSION_TOKEN = 'eyJhIjoiMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWYiLCJ0IjoiMTExMTExMTEtMjIyMi0zMzMzLTQ0NDQtNTU1NTU1NTU1NTU1IiwicyI6InNlY3JldCJ9';

export interface SessionCall { method: string; params: Record<string, unknown>; timeoutMs: number | undefined }

/** A session over in-memory streams: the spec plays the desktop (it writes requests and reads answers) and a scripted Hub answers the admin calls. */
export function sessionHarness(options: { state?: 'running' | 'not-installed'; elevated?: boolean; script?: (method: string, params: Record<string, unknown>) => unknown; idleMs?: number } = {}) {
  const f = fixture({ state: options.state ?? 'running', elevated: options.elevated ?? true });
  const calls: SessionCall[] = [];
  const toSession = new PassThrough();
  const fromSession = new PassThrough();
  const lines = createInterface({ input: fromSession })[Symbol.asyncIterator]();
  const deps: ProvisionSessionDeps = {
    ...f.deps, platform: 'win32',
    connect: async () => Duplex.from({ readable: toSession, writable: fromSession } as never),
    call: async (_dataDir, method, params, timeoutMs) => {
      calls.push({ method, params: params as Record<string, unknown>, timeoutMs });
      if (method === 'status') return { ok: true, port: 47600 };
      const scripted = options.script?.(method, params as Record<string, unknown>);
      if (scripted instanceof Error) throw scripted;
      if (scripted !== undefined) return scripted;
      switch (method) {
        case 'provision.status': return { report: { overall: 'ready', components: [] } };
        case 'provision.run': return { report: { overall: 'ready', components: [] }, created: ['storage'], restartRequired: false, failed: [] };
        case 'network.tunnel.status': return { configured: false, hostname: null, state: 'not-configured', tokenPresent: false, supported: true, logTail: [{ text: 'x' }] };
        case 'power.status': return { verdict: 'needs-change', sleepAcMinutes: 30, hibernateAcMinutes: 180, applied: false, sleepStates: ['S3'] };
        case 'backup.schedule.status': return { configured: false, intervalHours: null, destinations: [], keyPresent: false };
        case 'network.tunnel.preview':
          return {
            confirmToken: 'tok-on', expiresAt: 'later', consequenceClass: ['system-config'], requiredPhrase: HUB_TUNNEL_PHRASE,
            readiness: { ready: true, blockers: [], warnings: [{ id: 'tunnel-edge-tls', reason: 'r', fix: 'f' }] },
            summary: { hostname: SESSION_HOST, needsConnectorToken: true, disclosure: ['d1'], dashboard: { hostname: SESSION_HOST, service: 'https://127.0.0.1:47600', noTlsVerify: true, httpHostHeader: null } },
          };
        case 'network.tunnel.apply': return { tunnel: { hostname: SESSION_HOST }, warnings: ['tunnel-edge-tls', 'other'], restartRequired: true, status: { state: 'ready', secret: SESSION_TOKEN } };
        case 'oidc.configure': return { configured: true, redirectOrigin: 'https://notes.example.com', restartRequired: true };
        case 'power.preview': return { confirmToken: 'tok-p', expiresAt: 'later', consequenceClass: ['system-config'], summary: { action: 'apply' } };
        case 'power.apply': return { action: 'apply', verdict: 'ok', before: { sleepAcMinutes: 30 }, after: { sleepAcMinutes: 0 }, commands: ['powercfg ...'] };
        case 'backup.schedule.set': return { configured: true, intervalHours: 24, destinations: ['d-1'], destinationAdded: 'd-1' };
        case 'standby.grant.preview': return { confirmToken: 'tok-s', expiresAt: 'later', consequenceClass: ['network-config'], summary: { deviceId: SESSION_DEVICE } };
        case 'standby.grant.apply': return { deviceId: SESSION_DEVICE, granted: true, renewed: false };
        default: throw new Error(`unexpected ${method}`);
      }
    },
  };
  const done = runProvisionSession({ pipeName: SESSION_PIPE, dataDir: f.dataDir, installDir: f.installDir, ...(options.idleMs !== undefined ? { idleMs: options.idleMs } : {}) }, deps);
  let id = 0;
  const ask = async (op: string, params: unknown = {}): Promise<any> => {
    id += 1;
    toSession.write(`${JSON.stringify({ id, op, params })}\n`);
    const next = await lines.next();
    return JSON.parse(next.value as string);
  };
  const adminCalls = (): SessionCall[] => calls.filter((c) => c.method !== 'status');
  return { f, ask, calls, adminCalls, done, toSession, close: (): Promise<number> => { toSession.end(); return done; } };
}
