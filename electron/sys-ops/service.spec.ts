import { beforeEach, describe, expect, it } from 'vitest';
import type { SysApplyContext, SysOpDefinition } from '../sys-mutation';
import { registerServiceOps, SERVICE_OPS } from './service';

type HelperResult = { ok: true; data: unknown } | { ok: false; error: string; code?: number };

let config: Record<string, unknown>;
let calls: { method: string; params: Record<string, unknown> }[];
let controlResult: HelperResult | null;
let previousStartType: string;

const baseConfig = (over: Record<string, unknown> = {}) => ({
  name: 'Spooler', displayName: 'Print Spooler', description: '', state: 'running', type: 'own-process', startType: 'auto', pid: 10,
  binaryPath: 'x', account: 'LocalSystem', canPauseContinue: false, isDriver: false, dependencies: [], dependents: [], ...over,
});

const ctx: SysApplyContext = {
  elevated: false,
  signal: new AbortController().signal,
  backup: async () => undefined,
  helper: async (method, rawParams) => {
    const params = rawParams as Record<string, unknown>;
    calls.push({ method, params });
    switch (method) {
      case 'svc.config':
        return params['name'] === 'Missing' ? { ok: false, error: 'The specified service does not exist as an installed service.', code: 1060 } : { ok: true, data: { config } };
      case 'svc.control':
        return controlResult ?? { ok: true, data: { state: params['action'] === 'stop' ? 'stopped' : 'running' } };
      case 'svc.setStartType':
        return { ok: true, data: { previous: previousStartType } };
      default:
        return { ok: false, error: 'Unknown method.' };
    }
  },
};

const op = (kind: string) => SERVICE_OPS.find((def) => def.kind === kind) as SysOpDefinition<any>;
const REF = { name: 'Spooler', displayName: 'Print Spooler' };

beforeEach(() => {
  config = baseConfig();
  calls = [];
  controlResult = null;
  previousStartType = 'auto';
});

describe('registration and validation', () => {
  it('registers the four service ops', () => {
    const kinds: string[] = [];
    registerServiceOps((def) => { kinds.push(def.kind); });
    expect(kinds.sort()).toEqual(['service.restart', 'service.setStartType', 'service.start', 'service.stop']);
  });

  it('validates strictly', () => {
    for (const kind of ['service.start', 'service.stop', 'service.restart']) {
      expect(() => op(kind).validate(REF)).not.toThrow();
      for (const bad of [null, [], {}, { name: 'a' }, { ...REF, extra: 1 }, { ...REF, name: '' }, { ...REF, name: 'a/b' }, { ...REF, name: 'a\\b' }, { ...REF, displayName: 5 }, { ...REF, action: 'x' }]) {
        expect(() => op(kind).validate(bad)).toThrow();
      }
    }
    const set = op('service.setStartType');
    for (const startType of ['auto', 'auto-delayed', 'manual', 'disabled']) expect(() => set.validate({ ...REF, startType })).not.toThrow();
    for (const startType of ['boot', 'system', 'Auto', '', 3, undefined]) expect(() => set.validate({ ...REF, startType })).toThrow();
    expect(() => set.validate({ ...REF, startType: 'auto', extra: 1 })).toThrow();
  });
});

describe('service.start / service.stop', () => {
  it('start: calls svc.control, requires elevation, undo is stop', async () => {
    config = baseConfig({ state: 'stopped' });
    const preview = await op('service.start').preview(REF, ctx);
    expect(preview).toMatchObject({ target: 'Print Spooler (Spooler)', requiresElevation: true, noUndo: false, before: 'stopped', after: 'running' });
    expect(preview.typedConfirm).toBeUndefined();
    const applied = await op('service.start').apply(REF, preview.precondition, ctx);
    expect(calls.filter((c) => c.method === 'svc.control')).toEqual([{ method: 'svc.control', params: { name: 'Spooler', action: 'start' } }]);
    expect(applied).toMatchObject({ outcome: 'applied', before: 'stopped', after: 'running', undo: { kind: 'service.stop', params: REF } });
  });

  it('stop: lists dependents in the preview and undo is start', async () => {
    config = baseConfig({ dependents: ['A', 'B'] });
    const preview = await op('service.stop').preview(REF, ctx);
    expect(preview.warnings).toContain('Stopping this will also stop: A, B');
    expect(preview.requiresElevation).toBe(true);
    const applied = await op('service.stop').apply(REF, preview.precondition, ctx);
    expect(calls.some((c) => c.method === 'svc.control' && c.params['action'] === 'stop')).toBe(true);
    expect(applied).toMatchObject({ outcome: 'applied', after: 'stopped', undo: { kind: 'service.start', params: REF } });
  });

  it('requires the typed name for critical services and drivers', async () => {
    config = baseConfig({ name: 'RpcSs' });
    expect((await op('service.stop').preview({ name: 'RpcSs', displayName: 'RPC' }, ctx)).typedConfirm).toBe('RpcSs');
    config = baseConfig({ isDriver: true, name: 'disk' });
    expect((await op('service.stop').preview({ name: 'disk', displayName: 'Disk' }, ctx)).typedConfirm).toBe('disk');
  });

  it('blocks a no-op and conflicts when state changed or already in target state', async () => {
    const running = await op('service.start').preview(REF, ctx);
    expect(running.blockedReason).toMatch(/already running/);
    config = baseConfig({ state: 'stopped' });
    expect((await op('service.stop').preview(REF, ctx)).blockedReason).toMatch(/already stopped/);
    const preview = await op('service.stop').preview({ ...REF }, { ...ctx });
    expect(preview.blockedReason).toBeDefined();
    config = baseConfig();
    const good = await op('service.stop').preview(REF, ctx);
    config = baseConfig({ state: 'stopped' });
    expect(await op('service.stop').apply(REF, good.precondition, ctx)).toMatchObject({ outcome: 'conflict' });
    expect(calls.some((c) => c.method === 'svc.control')).toBe(false);
  });

  it('reports a missing service as blocked and surfaces helper failures with hints', async () => {
    expect((await op('service.stop').preview({ name: 'Missing', displayName: '' }, ctx)).blockedReason).toMatch(/does not exist/);
    const preview = await op('service.stop').preview(REF, ctx);
    controlResult = { ok: false, error: 'Cannot stop service.', code: 1051 };
    expect(await op('service.stop').apply(REF, preview.precondition, ctx)).toMatchObject({ outcome: 'failed', message: expect.stringMatching(/running dependents/) });
    controlResult = { ok: false, error: 'denied', code: 5 };
    expect(await op('service.stop').apply(REF, preview.precondition, ctx)).toMatchObject({ outcome: 'failed', message: expect.stringMatching(/Administrator/) });
  });
});

describe('service.restart', () => {
  it('is noUndo, requires elevation and restarts via svc.control', async () => {
    config = baseConfig({ dependents: ['Fax'] });
    const preview = await op('service.restart').preview(REF, ctx);
    expect(preview).toMatchObject({ noUndo: true, requiresElevation: true });
    expect(preview.warnings).toContain('Stopping this will also stop: Fax');
    const applied = await op('service.restart').apply(REF, preview.precondition, ctx);
    expect(calls.filter((c) => c.method === 'svc.control')[0].params).toEqual({ name: 'Spooler', action: 'restart' });
    expect(applied.outcome).toBe('applied');
    expect(applied.undo).toBeUndefined();
  });
});

describe('service.setStartType', () => {
  const params = { ...REF, startType: 'disabled' };

  it('previews before/after, records previous and undoes back to it', async () => {
    config = baseConfig({ startType: 'auto-delayed' });
    previousStartType = 'auto-delayed';
    const preview = await op('service.setStartType').preview(params, ctx);
    expect(preview).toMatchObject({ requiresElevation: true, noUndo: false, before: 'auto-delayed', after: 'disabled' });
    const applied = await op('service.setStartType').apply(params, preview.precondition, ctx);
    expect(calls.filter((c) => c.method === 'svc.setStartType')).toEqual([{ method: 'svc.setStartType', params: { name: 'Spooler', startType: 'disabled' } }]);
    expect(applied).toMatchObject({ outcome: 'applied', before: 'auto-delayed', after: 'disabled', undo: { kind: 'service.setStartType', params: { ...REF, startType: 'auto-delayed' } } });
  });

  it('blocks boot/system services and unchanged start types, and needs typed confirm when critical', async () => {
    config = baseConfig({ startType: 'boot', isDriver: true });
    expect((await op('service.setStartType').preview(params, ctx)).blockedReason).toMatch(/cannot be changed/);
    config = baseConfig({ startType: 'disabled' });
    expect((await op('service.setStartType').preview(params, ctx)).blockedReason).toMatch(/already/);
    config = baseConfig({ name: 'Dnscache' });
    expect((await op('service.setStartType').preview({ name: 'Dnscache', displayName: 'DNS', startType: 'manual' }, ctx)).typedConfirm).toBe('Dnscache');
  });

  it('conflicts when the start type changed since the preview', async () => {
    const preview = await op('service.setStartType').preview(params, ctx);
    config = baseConfig({ startType: 'manual' });
    expect(await op('service.setStartType').apply(params, preview.precondition, ctx)).toMatchObject({ outcome: 'conflict' });
  });
});
