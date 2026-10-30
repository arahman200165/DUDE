import { existsSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { provision } from './engine.js';
import { createProvisioningService } from './service.js';
import { deriveOverall } from './state.js';
import { cleanRoots, engineOptions, fakeProbes, tempPaths } from './provisioning-fixture.js';

afterEach(cleanRoots);

describe('createProvisioningService', () => {
  it('caches a report for its time to live, shares a concurrent check and checks again after invalidate', async () => {
    const paths = tempPaths();
    await provision(paths, engineOptions());
    let clock = 1_000_000;
    let pings = 0;
    const service = createProvisioningService(paths, {
      ...engineOptions({ probes: fakeProbes({ workerPing: () => { pings += 1; return Promise.resolve('node re-spawn'); } }) }),
      now: () => clock,
      ttlMs: 60_000,
    });
    const [a, b] = await Promise.all([service.status(), service.status()]);
    expect(a).toBe(b);
    expect(pings).toBe(1);
    clock += 59_000;
    expect(await service.status()).toBe(a);
    expect(pings).toBe(1);
    clock += 2_000;
    expect(await service.status()).not.toBe(a);
    expect(pings).toBe(2);
    service.invalidate();
    await service.status();
    expect(pings).toBe(3);
  });

  it('logs the overall state and counts at start, never a detail sentence, and never creates the store', async () => {
    const paths = tempPaths();
    const lines: Array<{ event: string; detail: Record<string, unknown> }> = [];
    const service = createProvisioningService(paths, engineOptions());
    await service.checkAtStart((event, detail) => lines.push({ event, detail }));
    expect(existsSync(paths.saveSphereDbPath)).toBe(false);
    expect(lines).toEqual([{ event: 'provisioning.checked', detail: { overall: 'not-provisioned', components: { 'not-configured': 6, ready: 2, unavailable: 3 } } }]);
    expect(JSON.stringify(lines)).not.toContain(paths.root);
  });

  it('swallows a check that cannot run', async () => {
    const paths = tempPaths();
    const service = createProvisioningService(paths, {
      ...engineOptions({ components: [{ id: 'power', check: () => ({ state: 'ready', detail: 'ok' }) }] }),
      now: () => { throw new Error('clock failed'); },
    });
    const lines: string[] = [];
    await service.checkAtStart((event) => lines.push(event));
    expect(lines).toEqual(['provisioning.check-failed']);
  });
});

describe('deriveOverall', () => {
  const base = { storeState: 'ready' as const, lastRun: { at: 'x', outcome: 'ok' as const, hubInstanceId: 'a' }, hubInstanceId: 'a', secrets: [] };
  const ready = [{ state: 'ready' as const, core: true }, { state: 'unavailable' as const, core: false }, { state: 'not-configured' as const, core: false }];

  it('orders the outcomes: store, run needed, attention, degraded, ready', () => {
    expect(deriveOverall({ ...base, storeState: 'absent', lastRun: null, components: ready })).toBe('not-provisioned');
    expect(deriveOverall({ ...base, storeState: 'corrupt', components: ready })).toBe('needs-attention');
    expect(deriveOverall({ ...base, storeState: 'incompatible', components: ready })).toBe('needs-attention');
    expect(deriveOverall({ ...base, lastRun: null, components: ready })).toBe('needs-provisioning');
    expect(deriveOverall({ ...base, hubInstanceId: 'b', components: ready })).toBe('needs-provisioning');
    expect(deriveOverall({ ...base, components: [...ready, { state: 'not-configured', core: true }] })).toBe('needs-provisioning');
    expect(deriveOverall({ ...base, components: ready, secrets: [{ purpose: 'p', present: false, needsReentry: true }] })).toBe('needs-provisioning');
    expect(deriveOverall({ ...base, components: [...ready, { state: 'needs-attention', core: false }, { state: 'degraded', core: false }] })).toBe('needs-attention');
    expect(deriveOverall({ ...base, components: [...ready, { state: 'degraded', core: false }] })).toBe('degraded');
    expect(deriveOverall({ ...base, components: ready })).toBe('ready');
  });

  it('does not compare identities when either side is unknown', () => {
    expect(deriveOverall({ ...base, hubInstanceId: undefined, components: ready })).toBe('ready');
    expect(deriveOverall({ ...base, lastRun: { at: 'x', outcome: 'ok' }, components: ready })).toBe('ready');
  });
});
