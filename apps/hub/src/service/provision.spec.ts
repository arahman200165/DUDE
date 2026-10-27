import { describe, expect, it } from 'vitest';
import type { HubProvisioningResponse } from '@dude/contracts/hub';
import { AdminCallError, HUB_NOT_RUNNING } from '../admin/admin-client.js';
import { runProvision, provisionExitCode } from './provision.js';
import type { ProvisionCommandOptions } from './provision.js';
import { fixture } from './test-helpers.js';

const AT = '2026-10-27T12:00:00.000Z';
const report = (overall: HubProvisioningResponse['overall'], extra: Partial<HubProvisioningResponse> = {}): HubProvisioningResponse => ({
  overall, checkedAt: AT, lastRun: { at: AT, outcome: 'ok' },
  components: [
    { id: 'content-store', state: 'ready', detail: 'Opens in WAL mode.', checkedAt: AT },
    { id: 'vector', state: 'unavailable', detail: 'Vector search is not available in this deployment.', checkedAt: AT },
    { id: 'secrets', state: 'needs-attention', detail: '1 secret must be entered again.', checkedAt: AT, nextAction: 'Enter them again in the setup step.' },
  ],
  secrets: [{ purpose: 'tunnel.connectorToken', present: false, needsReentry: true }],
  commands: ['dude-hub provision', 'dude-hub provision status'],
  ...extra,
});

interface Call { method: string; params: unknown; timeoutMs: number | undefined }

function harness(result: unknown, options: { fail?: (method: string) => Error | undefined; state?: 'running' | 'not-installed'; elevated?: boolean } = {}) {
  const f = fixture({ state: options.state ?? 'running', elevated: options.elevated ?? true });
  const calls: Call[] = [];
  const deps = {
    ...f.deps,
    call: async (_dir: string, method: string, params: unknown, timeoutMs?: number): Promise<unknown> => {
      calls.push({ method, params, timeoutMs });
      const error = options.fail?.(method);
      if (error) throw error;
      return method === 'status' ? { ok: true } : result;
    },
  };
  const run = (opts: Partial<ProvisionCommandOptions> = {}): Promise<number> => runProvision({ action: 'run', dataDir: f.dataDir, ...opts }, deps);
  const adminCalls = (): Call[] => calls.filter((c) => c.method !== 'status');
  return { f, run, adminCalls };
}

describe('provisionExitCode', () => {
  it('is 0 for ready and degraded and 1 for everything that needs the owner', () => {
    expect(provisionExitCode('ready')).toBe(0);
    expect(provisionExitCode('degraded')).toBe(0);
    for (const overall of ['needs-attention', 'needs-provisioning', 'not-provisioned']) expect(provisionExitCode(overall)).toBe(1);
  });
});

describe('dude-hub provision', () => {
  it('runs provision.run with no parameters, prints a readable report and exits 0 when ready', async () => {
    const h = harness({ report: report('ready'), created: ['content-store', 'storage/blobs'], restartRequired: false, failed: [] });
    expect(await h.run()).toBe(0);
    expect(h.adminCalls()).toEqual([{ method: 'provision.run', params: {}, timeoutMs: 120_000 }]);
    const out = h.f.out.join('');
    expect(out).toContain('Provisioning finished.');
    expect(out).toContain('Created: content-store, storage/blobs');
    expect(out).toMatch(/content-store\s+ready\s+Opens in WAL mode\./);
    expect(out).toMatch(/vector\s+unavailable/);
    expect(out).toContain('-> Enter them again in the setup step.');
    expect(out).toContain('Overall: Ready.');
  });

  it('exits 1 and says what to do when the Hub needs provisioning or a secret again', async () => {
    const h = harness({ report: report('needs-provisioning'), created: [], restartRequired: false, failed: [] });
    expect(await h.run()).toBe(1);
    expect(h.f.out.join('')).toContain('Overall: Needs provisioning');
    expect(h.f.out.join('')).toContain('Created: nothing');
  });

  it('prints only the report as JSON with --json, and the restart note otherwise', async () => {
    const result = { report: report('degraded'), created: ['content-store'], restartRequired: true, failed: ['tunnel'] };
    const json = harness(result);
    expect(await json.run({ json: true })).toBe(0);
    expect(JSON.parse(json.f.out.join(''))).toEqual(result.report);
    const text = harness(result);
    await text.run();
    expect(text.f.out.join('')).toContain('restart the Hub service');
    expect(text.f.out.join('')).toContain('A provisioning step failed for: tunnel.');
  });

  it('status calls provision.status, is not elevated and says nothing was changed', async () => {
    const h = harness({ report: report('ready') }, { elevated: false });
    expect(await h.run({ action: 'status' })).toBe(0);
    expect(h.adminCalls().map((c) => c.method)).toEqual(['provision.status']);
    expect(h.f.out.join('')).toContain('nothing was changed');
  });

  it('refuses a run from an unelevated terminal when the service is installed, and runs without a service', async () => {
    const refused = harness({ report: report('ready') }, { elevated: false });
    expect(await refused.run()).toBe(2);
    expect(refused.adminCalls()).toEqual([]);
    expect(refused.f.err.join('')).toMatch(/elevated/);
    const bare = harness({ report: report('ready') }, { state: 'not-installed', elevated: false });
    expect(await bare.run()).toBe(0);
  });

  it('exits 2 when the Hub is not running and 1 for a failed, timed-out or unreadable call', async () => {
    const down = harness(null, { fail: (m) => (m === 'status' ? new AdminCallError(HUB_NOT_RUNNING, 'down') : undefined) });
    expect(await down.run()).toBe(2);
    expect(down.f.err.join('')).toMatch(/Hub is not running/);
    const timeout = harness(null, { fail: (m) => (m === 'provision.run' ? new AdminCallError('timeout', 'slow') : undefined) });
    expect(await timeout.run()).toBe(1);
    expect(timeout.f.err.join('')).toMatch(/did not answer in time/);
    const refused = harness(null, { fail: (m) => (m === 'provision.run' ? new AdminCallError('provision-failed', 'Provisioning could not complete.') : undefined) });
    expect(await refused.run()).toBe(1);
    expect(refused.f.err.join('')).toContain('Provisioning could not complete.');
    const garbage = harness({ report: { overall: 'maybe' } });
    expect(await garbage.run()).toBe(1);
    expect(garbage.f.err.join('')).toMatch(/does not understand/);
  });
});
