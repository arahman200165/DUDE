import { beforeEach, describe, expect, it } from 'vitest';
import type { SysApplyContext, SysOpDefinition, SysOpPreviewResult } from '../sys-mutation';
import { STARTUP_OPS } from './startup';

interface Stored { type: string; data: string }
type Result = { ok: true; data: unknown } | { ok: false; error: string; code?: number };
let store: Record<string, Stored>;
let calls: { method: string; params: Record<string, unknown> }[];
const ok = (data: unknown = {}): Result => ({ ok: true, data });
const ctx: SysApplyContext = {
  elevated: false,
  signal: new AbortController().signal,
  backup: async () => {},
  helper: async (method, raw) => {
    const p = raw as Record<string, unknown>;
    calls.push({ method, params: p });
    if (method === 'reg.getValues') return ok({ values: Object.entries(store).map(([name, value]) => ({ name, type: value.type, rawType: 3, byteLength: value.data.length / 2, data: value.data })) });
    if (method === 'reg.setValue') { store[p['name'] as string] = { type: p['type'] as string, data: p['data'] as string }; return ok(); }
    if (method === 'reg.deleteValue') { delete store[p['name'] as string]; return ok(); }
    return { ok: false, error: `Unexpected helper call ${method}.` };
  },
};
const op = (kind: string) => STARTUP_OPS.find((def) => def.kind === kind) as SysOpDefinition<any>;
const ref = { hive: 'HKCU', path: 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run', view: 'default', valueName: 'Example', exists: false };

beforeEach(() => { store = {}; calls = []; });

describe('StartupApproved enable/disable operations', () => {
  it('disables a missing approval by creating a Task Manager stamp and undo removes that new value', async () => {
    const def = op('startup.disable');
    const params = def.validate({ ...ref, enabled: false });
    const preview = await def.preview(params, ctx) as SysOpPreviewResult;
    expect(preview.blockedReason).toBeUndefined();
    const applied = await def.apply(params, preview.precondition, ctx);
    expect(applied.outcome).toBe('applied');
    expect(calls.find((call) => call.method === 'reg.setValue')?.params['data']).toMatch(/^03(?:00){3}[0-9a-f]{16}$/);
    expect(store['Example'].data.slice(0, 2)).toBe('03');

    const undo = applied.undo!;
    const undoDef = op(undo.kind);
    const undoParams = undoDef.validate(undo.params);
    const undoPreview = await undoDef.preview(undoParams, ctx);
    expect(undoPreview.blockedReason).toBeUndefined();
    const restored = await undoDef.apply(undoParams, undoPreview.precondition, ctx);
    expect(restored.outcome).toBe('applied');
    expect(store['Example']).toBeUndefined();
    expect(calls.at(-1)?.method).toBe('reg.deleteValue');
  });

  it('restores exact prior bytes when undoing a change to an existing value', async () => {
    const original = '030000001122334455667788';
    store['Example'] = { type: 'REG_BINARY', data: original };
    const def = op('startup.enable');
    const params = def.validate({ ...ref, exists: true, bytes: original, enabled: true });
    const preview = await def.preview(params, ctx);
    const applied = await def.apply(params, preview.precondition, ctx);
    expect(applied.outcome).toBe('applied');
    expect(store['Example'].data).toBe('020000000000000000000000');
    const undoDef = op(applied.undo!.kind);
    const undoParams = undoDef.validate(applied.undo!.params);
    const undoPreview = await undoDef.preview(undoParams, ctx);
    const undone = await undoDef.apply(undoParams, undoPreview.precondition, ctx);
    expect(undone.outcome).toBe('applied');
    expect(store['Example'].data).toBe(original);
  });

  it('conflicts if the value appears after previewing its absence', async () => {
    const def = op('startup.disable');
    const params = def.validate({ ...ref, enabled: false });
    const preview = await def.preview(params, ctx);
    store['Example'] = { type: 'REG_BINARY', data: '020000000000000000000000' };
    const applied = await def.apply(params, preview.precondition, ctx);
    expect(applied.outcome).toBe('conflict');
    expect(calls.some((call) => call.method === 'reg.setValue')).toBe(false);
  });

  it('treats a missing value as already enabled and blocks that no-op', async () => {
    const def = op('startup.enable');
    const params = def.validate({ ...ref, enabled: true });
    const preview = await def.preview(params, ctx);
    expect(preview.blockedReason).toContain('already enabled');
  });
});
