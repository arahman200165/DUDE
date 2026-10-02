import { beforeEach, describe, expect, it } from 'vitest';
import type { SysApplyContext, SysOpDefinition } from '../sys-mutation';
import { ENV_OPS, registerEnvOps } from './env';

type HelperResult = { ok: true; data: unknown } | { ok: false; error: string; code?: number };

interface Stored { type: string; data: string }
let store: Record<string, Stored>;
let calls: { method: string; params: Record<string, unknown> }[];
let broadcastResult: HelperResult;

const ok = (data: unknown = { ok: true }): HelperResult => ({ ok: true, data });

const ctx: SysApplyContext = {
  elevated: false,
  signal: new AbortController().signal,
  backup: async () => {},
  helper: async (method, rawParams) => {
    const params = rawParams as Record<string, unknown>;
    calls.push({ method, params });
    if (method === 'reg.getValues') {
      return ok({ values: Object.entries(store).map(([name, v]) => ({ name, type: v.type, rawType: 1, byteLength: 0, data: v.data })) });
    }
    if (method === 'reg.setValue') {
      store[params['name'] as string] = { type: params['type'] as string, data: params['data'] as string };
      return ok();
    }
    if (method === 'reg.deleteValue') {
      if (!(params['name'] as string in store)) return { ok: false, error: 'The value does not exist.', code: 2 };
      delete store[params['name'] as string];
      return ok();
    }
    if (method === 'env.broadcast') return broadcastResult;
    return { ok: false, error: 'Unknown method.' };
  },
};

const op = (kind: string) => ENV_OPS.find((def) => def.kind === kind) as SysOpDefinition<any>;
const methods = () => calls.map((call) => call.method);
const USER_KEY = { hive: 'HKCU', path: 'Environment', view: 'default' };

beforeEach(() => {
  store = {};
  calls = [];
  broadcastResult = ok();
});

describe('registration and validation', () => {
  it('registers env.set and env.delete', () => {
    const kinds: string[] = [];
    registerEnvOps((def) => { kinds.push(def.kind); });
    expect(kinds.sort()).toEqual(['env.delete', 'env.set']);
  });

  it('rejects malformed params, unknown scopes and bad names', () => {
    const good = { scope: 'user', name: 'FOO', value: 'bar', expandable: false };
    expect(op('env.set').validate(good)).toEqual(good);
    for (const bad of [
      null, [], {}, { ...good, scope: 'system' }, { ...good, name: '' }, { ...good, name: 'A=B' }, { ...good, name: 'A\0B' },
      { ...good, name: 'x'.repeat(256) }, { ...good, value: 5 }, { ...good, value: 'a\0b' }, { ...good, expandable: 'yes' }, { ...good, extra: 1 },
    ]) {
      expect(() => op('env.set').validate(bad)).toThrow();
    }
    expect(() => op('env.delete').validate({ scope: 'machine', name: 'FOO' })).not.toThrow();
    expect(() => op('env.delete').validate({ scope: 'other', name: 'FOO' })).toThrow();
    expect(() => op('env.delete').validate({ scope: 'user', name: 'FOO', value: 'x' })).toThrow();
  });
});

describe('env.set', () => {
  const params = { scope: 'user', name: 'FOO', value: 'new', expandable: false };

  it('previews a create on the user scope without elevation', async () => {
    const preview = await op('env.set').preview(params, ctx);
    expect(preview).toMatchObject({ target: 'user environment: FOO', requiresElevation: false, noUndo: false, after: 'new' });
    expect(preview.before).toBeUndefined();
    expect(preview.precondition).toEqual({ existed: false, type: null, value: null });
    expect(preview.blockedReason).toBeUndefined();
  });

  it('creates a variable, broadcasts, and undoes by deleting it', async () => {
    const preview = await op('env.set').preview(params, ctx);
    calls = [];
    const result = await op('env.set').apply(params, preview.precondition, ctx);
    expect(result.outcome).toBe('applied');
    expect(calls.find((c) => c.method === 'reg.setValue')?.params).toEqual({ ...USER_KEY, name: 'FOO', type: 'REG_SZ', data: 'new' });
    expect(methods().at(-1)).toBe('env.broadcast');
    expect(result.undo).toEqual({ kind: 'env.delete', params: { scope: 'user', name: 'FOO' } });
  });

  it('replaces an existing value and records a restore-prior undo (keeping the type)', async () => {
    store['FOO'] = { type: 'REG_EXPAND_SZ', data: '%TEMP%\\old' };
    const preview = await op('env.set').preview(params, ctx);
    expect(preview.before).toBe('%TEMP%\\old');
    const result = await op('env.set').apply(params, preview.precondition, ctx);
    expect(result).toMatchObject({ outcome: 'applied', before: '%TEMP%\\old', after: 'new' });
    expect(result.undo).toEqual({ kind: 'env.set', params: { scope: 'user', name: 'FOO', value: '%TEMP%\\old', expandable: true } });
    expect(store['FOO']).toEqual({ type: 'REG_SZ', data: 'new' });
  });

  it('writes REG_EXPAND_SZ when expandable', async () => {
    const p = { ...params, value: '%TEMP%\\x', expandable: true };
    const preview = await op('env.set').preview(p, ctx);
    await op('env.set').apply(p, preview.precondition, ctx);
    expect(store['FOO']).toEqual({ type: 'REG_EXPAND_SZ', data: '%TEMP%\\x' });
  });

  it('requires elevation and warns on the machine scope, targeting the Session Manager key', async () => {
    const p = { ...params, scope: 'machine' };
    const preview = await op('env.set').preview(p, ctx);
    expect(preview.requiresElevation).toBe(true);
    expect(preview.target).toBe('machine environment: FOO');
    expect(preview.warnings?.join(' ')).toMatch(/machine-wide/);
    calls = [];
    await op('env.set').apply(p, preview.precondition, ctx);
    expect(calls.find((c) => c.method === 'reg.setValue')?.params).toMatchObject({
      hive: 'HKLM', path: 'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment',
    });
  });

  it('warns (but does not block) when editing PATH', async () => {
    const preview = await op('env.set').preview({ ...params, name: 'Path' }, ctx);
    expect(preview.warnings?.join(' ')).toMatch(/PATH Editor is safer/);
    expect(preview.blockedReason).toBeUndefined();
  });

  it('reports a conflict when the value changed since the preview', async () => {
    store['FOO'] = { type: 'REG_SZ', data: 'one' };
    const preview = await op('env.set').preview(params, ctx);
    store['FOO'] = { type: 'REG_SZ', data: 'two' };
    calls = [];
    const result = await op('env.set').apply(params, preview.precondition, ctx);
    expect(result.outcome).toBe('conflict');
    expect(methods()).not.toContain('reg.setValue');
  });

  it('reports a conflict when the type changed or the variable appeared', async () => {
    store['FOO'] = { type: 'REG_SZ', data: 'one' };
    const preview = await op('env.set').preview(params, ctx);
    store['FOO'] = { type: 'REG_EXPAND_SZ', data: 'one' };
    expect((await op('env.set').apply(params, preview.precondition, ctx)).outcome).toBe('conflict');
    store = {};
    const fresh = await op('env.set').preview(params, ctx);
    store['FOO'] = { type: 'REG_SZ', data: 'sneaky' };
    expect((await op('env.set').apply(params, fresh.precondition, ctx)).outcome).toBe('conflict');
  });

  it('is still applied when only the broadcast fails', async () => {
    broadcastResult = { ok: false, error: 'timed out' };
    const preview = await op('env.set').preview(params, ctx);
    const result = await op('env.set').apply(params, preview.precondition, ctx);
    expect(result.outcome).toBe('applied');
    expect(result.message).toMatch(/notifying running programs failed/);
  });

  it('blocks overwriting a non-text value', async () => {
    store['FOO'] = { type: 'REG_DWORD', data: 1 as unknown as string };
    const preview = await op('env.set').preview(params, ctx);
    expect(preview.blockedReason).toMatch(/REG_DWORD/);
  });
});

describe('env.delete', () => {
  const params = { scope: 'user', name: 'FOO' };

  it('blocks when the variable does not exist', async () => {
    const preview = await op('env.delete').preview(params, ctx);
    expect(preview.blockedReason).toMatch(/does not exist/);
  });

  it('deletes the value, broadcasts, and undoes with env.set of the old value and type', async () => {
    store['FOO'] = { type: 'REG_EXPAND_SZ', data: '%A%\\b' };
    const preview = await op('env.delete').preview(params, ctx);
    expect(preview).toMatchObject({ before: '%A%\\b', requiresElevation: false, target: 'user environment: FOO' });
    calls = [];
    const result = await op('env.delete').apply(params, preview.precondition, ctx);
    expect(result.outcome).toBe('applied');
    expect(calls.find((c) => c.method === 'reg.deleteValue')?.params).toEqual({ ...USER_KEY, name: 'FOO' });
    expect(methods().at(-1)).toBe('env.broadcast');
    expect(result.undo).toEqual({ kind: 'env.set', params: { scope: 'user', name: 'FOO', value: '%A%\\b', expandable: true } });
    expect(store['FOO']).toBeUndefined();
  });

  it('conflicts when the value changed, or vanished, before apply', async () => {
    store['FOO'] = { type: 'REG_SZ', data: 'one' };
    const preview = await op('env.delete').preview(params, ctx);
    store['FOO'] = { type: 'REG_SZ', data: 'two' };
    expect((await op('env.delete').apply(params, preview.precondition, ctx)).outcome).toBe('conflict');
    delete store['FOO'];
    expect((await op('env.delete').apply(params, preview.precondition, ctx)).outcome).toBe('conflict');
  });
});

// The protected-location denylist (HKLM\SAM, SECURITY, BCD00000000, service ImagePath/ServiceDll) is enforced
// inside the native helper's registry_ops.cpp, not here; it is covered by the real-helper smoke test.
