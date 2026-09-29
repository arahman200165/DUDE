import { beforeEach, describe, expect, it } from 'vitest';
import type { SysApplyContext, SysOpDefinition } from '../sys-mutation';
import { REGISTRY_OPS, registerRegistryOps } from './registry';

type HelperResult = { ok: true; data: unknown } | { ok: false; error: string; code?: number };

interface Stored { type: string; data: unknown; byteLength?: number }
let keyExists: boolean;
let values: Record<string, Stored>;
let subkeys: string[];
let calls: { method: string; params: Record<string, unknown> }[];
let backups: { name: string; content: string | Buffer }[];
let createResult: boolean;
let setFailure: HelperResult | null;

const ok = (data: unknown = { ok: true }): HelperResult => ({ ok: true, data });
const missing: HelperResult = { ok: false, error: 'The system cannot find the file specified.', code: 2 };

const ctx: SysApplyContext = {
  elevated: false,
  signal: new AbortController().signal,
  backup: async (name, content) => { backups.push({ name, content }); },
  helper: async (method, rawParams) => {
    const params = rawParams as Record<string, unknown>;
    calls.push({ method, params });
    switch (method) {
      case 'reg.getValues':
        if (!keyExists) return missing;
        return ok({ values: Object.entries(values).map(([name, v]) => ({ name, type: v.type, rawType: 1, byteLength: v.byteLength ?? 4, data: v.data })) });
      case 'reg.enumKey':
        if (!keyExists) return missing;
        return ok({ lastWriteMs: 0, subkeys: subkeys.map((name) => ({ name, subkeyCount: 0, valueCount: 0, lastWriteMs: 0 })) });
      case 'reg.export':
        if (!keyExists) return missing;
        return ok({ text: 'Windows Registry Editor Version 5.00\r\n', keysExported: 1 });
      case 'reg.setValue':
        if (setFailure) return setFailure;
        keyExists = true;
        values[params['name'] as string] = { type: params['type'] as string, data: params['data'] };
        return ok();
      case 'reg.deleteValue':
        if (!((params['name'] as string) in values)) return { ok: false, error: 'The value does not exist.', code: 2 };
        delete values[params['name'] as string];
        return ok();
      case 'reg.createKey': {
        const created = !keyExists && createResult;
        keyExists = true;
        return ok({ created });
      }
      case 'reg.deleteKeyIfEmpty':
        keyExists = false;
        return ok();
      default:
        return { ok: false, error: 'Unknown method.' };
    }
  },
};

const op = (kind: string) => REGISTRY_OPS.find((def) => def.kind === kind) as SysOpDefinition<any>;
const methods = () => calls.map((call) => call.method);
const KEY = { hive: 'HKCU', path: 'Software\\Acme', view: 'default' };

beforeEach(() => {
  keyExists = true;
  values = {};
  subkeys = [];
  calls = [];
  backups = [];
  createResult = true;
  setFailure = null;
});

describe('registration and validation', () => {
  it('registers the four registry ops', () => {
    const kinds: string[] = [];
    registerRegistryOps((def) => { kinds.push(def.kind); });
    expect(kinds.sort()).toEqual(['registry.createKey', 'registry.deleteKeyIfEmpty', 'registry.deleteValue', 'registry.setValue']);
  });

  it('validates setValue params per type and rejects the rest', () => {
    const set = op('registry.setValue');
    const good = [
      { ...KEY, name: 'A', type: 'REG_SZ', data: 'x' }, { ...KEY, name: '', type: 'REG_DWORD', data: 7 },
      { ...KEY, name: 'A', type: 'REG_MULTI_SZ', data: ['a', 'b'] }, { ...KEY, name: 'A', type: 'REG_QWORD', data: '18446744073709551615' },
      { ...KEY, name: 'A', type: 'REG_BINARY', data: '00ff' }, { ...KEY, name: 'A', type: 'REG_NONE' },
    ];
    for (const params of good) expect(() => set.validate(params)).not.toThrow();
    expect(set.validate({ ...KEY, name: 'A', type: 'REG_BINARY', data: '00FF' })).toMatchObject({ data: '00ff' });
    for (const bad of [
      null, [], {}, { ...good[0], hive: 'HKXX' }, { ...good[0], view: '16' }, { ...good[0], path: '' }, { ...good[0], path: '\\x' },
      { ...good[0], extra: 1 }, { ...good[0], type: 'REG_UNKNOWN' }, { ...good[0], type: 'REG_DWORD_BIG_ENDIAN', data: 1 },
      { ...good[0], data: 5 }, { ...good[0], data: 'a\0b' }, { ...good[1], data: -1 }, { ...good[1], data: 4294967296 }, { ...good[1], data: 1.5 },
      { ...good[2], data: ['a', ''] }, { ...good[2], data: 'a' }, { ...good[3], data: '18446744073709551616' }, { ...good[3], data: 5 },
      { ...good[4], data: 'abc' }, { ...good[4], data: 'zz' }, { ...good[5], data: 'x' }, { ...good[0], name: 'a\0' },
    ]) {
      expect(() => set.validate(bad)).toThrow();
    }
  });

  it('validates the other ops', () => {
    expect(() => op('registry.deleteValue').validate({ ...KEY, name: 'A' })).not.toThrow();
    expect(() => op('registry.deleteValue').validate({ ...KEY })).toThrow();
    expect(() => op('registry.deleteValue').validate({ ...KEY, name: 'A', type: 'REG_SZ' })).toThrow();
    for (const kind of ['registry.createKey', 'registry.deleteKeyIfEmpty']) {
      expect(() => op(kind).validate(KEY)).not.toThrow();
      expect(() => op(kind).validate({ ...KEY, path: '' })).toThrow();
      expect(() => op(kind).validate({ ...KEY, name: 'A' })).toThrow();
      expect(() => op(kind).validate({ ...KEY, hive: 'nope' })).toThrow();
    }
  });
});

describe('registry.setValue', () => {
  const params = { ...KEY, name: 'Greeting', type: 'REG_SZ', data: 'new' };

  it('previews a create with the composed target and no elevation for HKCU', async () => {
    const preview = await op('registry.setValue').preview(params, ctx);
    expect(preview).toMatchObject({ target: 'HKCU\\Software\\Acme\\Greeting', requiresElevation: false, noUndo: false, after: 'REG_SZ: new' });
    expect(preview.before).toBeUndefined();
    expect(preview.blockedReason).toBeUndefined();
  });

  it('labels the default value and warns when the key will be created', async () => {
    keyExists = false;
    const preview = await op('registry.setValue').preview({ ...params, name: '' }, ctx);
    expect(preview.target).toBe('HKCU\\Software\\Acme\\(Default)');
    expect(preview.warnings).toContain('The key does not exist and will be created.');
  });

  it('requires elevation under HKLM and for the default profile in HKU, but not for HKCU', async () => {
    expect((await op('registry.setValue').preview({ ...params, hive: 'HKLM' }, ctx)).requiresElevation).toBe(true);
    expect((await op('registry.setValue').preview({ ...params, hive: 'HKU', path: '.DEFAULT\\Software' }, ctx)).requiresElevation).toBe(true);
    expect((await op('registry.setValue').preview({ ...params, hive: 'HKU', path: 'S-1-5-21-1\\Software' }, ctx)).requiresElevation).toBe(false);
    expect((await op('registry.setValue').preview(params, ctx)).requiresElevation).toBe(false);
  });

  it('records the helper call, a .reg backup and an undo that restores the old value', async () => {
    values['Greeting'] = { type: 'REG_SZ', data: 'old' };
    const pre = (await op('registry.setValue').preview(params, ctx)).precondition;
    calls = [];
    const result = await op('registry.setValue').apply(params, pre, ctx);
    expect(result).toMatchObject({
      outcome: 'applied', before: 'REG_SZ: old', after: 'REG_SZ: new',
      undo: { kind: 'registry.setValue', params: { ...KEY, name: 'Greeting', type: 'REG_SZ', data: 'old' } },
    });
    expect(methods()).toEqual(['reg.getValues', 'reg.export', 'reg.setValue']);
    expect(calls[1]?.params).toEqual({ ...KEY, recursive: false });
    expect(calls[2]?.params).toEqual({ ...KEY, name: 'Greeting', type: 'REG_SZ', data: 'new' });
    expect(values['Greeting']?.data).toBe('new');
    expect(backups).toHaveLength(1);
    expect(backups[0]?.name).toMatch(/\.reg$/);
    const content = backups[0]?.content as Buffer;
    expect([content[0], content[1]]).toEqual([0xff, 0xfe]);
    expect(content.subarray(2).toString('utf16le')).toContain('Windows Registry Editor Version 5.00');
  });

  it('undoes a create by deleting the value', async () => {
    const pre = (await op('registry.setValue').preview(params, ctx)).precondition;
    const result = await op('registry.setValue').apply(params, pre, ctx);
    expect(result.undo).toEqual({ kind: 'registry.deleteValue', params: { ...KEY, name: 'Greeting' } });
  });

  it('detects a change between preview and apply as a conflict and writes nothing', async () => {
    values['Greeting'] = { type: 'REG_SZ', data: 'old' };
    const pre = (await op('registry.setValue').preview(params, ctx)).precondition;
    values['Greeting'] = { type: 'REG_SZ', data: 'changed behind our back' };
    calls = [];
    const result = await op('registry.setValue').apply(params, pre, ctx);
    expect(result.outcome).toBe('conflict');
    expect(methods()).toEqual(['reg.getValues']);
    expect(backups).toHaveLength(0);
  });

  it('surfaces a native denylist or access error as a failed outcome', async () => {
    const pre = (await op('registry.setValue').preview(params, ctx)).precondition;
    setFailure = { ok: false, error: 'This registry location is protected from edits by DUDE.' };
    expect(await op('registry.setValue').apply(params, pre, ctx)).toEqual({ outcome: 'failed', message: 'This registry location is protected from edits by DUDE.' });
    setFailure = { ok: false, error: 'Access is denied.', code: 5 };
    expect(await op('registry.setValue').apply(params, pre, ctx)).toMatchObject({ outcome: 'failed', message: expect.stringContaining('Relaunch as Administrator') });
  });

  it('flags an unrestorable existing type as noUndo and records no undo', async () => {
    values['Greeting'] = { type: 'REG_DWORD_BIG_ENDIAN', data: 1 };
    const preview = await op('registry.setValue').preview(params, ctx);
    expect(preview.noUndo).toBe(true);
    const result = await op('registry.setValue').apply(params, preview.precondition, ctx);
    expect(result.outcome).toBe('applied');
    expect(result.undo).toBeUndefined();
    expect(backups).toHaveLength(1);
  });

  it('sends REG_NONE without data and restores a DWORD as a number', async () => {
    values['Count'] = { type: 'REG_DWORD', data: 42 };
    const dword = { ...KEY, name: 'Count', type: 'REG_DWORD', data: 43 };
    const pre = (await op('registry.setValue').preview(dword, ctx)).precondition;
    expect((await op('registry.setValue').apply(dword, pre, ctx)).undo).toEqual({
      kind: 'registry.setValue', params: { ...KEY, name: 'Count', type: 'REG_DWORD', data: 42 },
    });
    const none = { ...KEY, name: 'Marker', type: 'REG_NONE', data: null };
    const nonePre = (await op('registry.setValue').preview(none, ctx)).precondition;
    calls = [];
    await op('registry.setValue').apply(none, nonePre, ctx);
    expect(calls.find((c) => c.method === 'reg.setValue')?.params).toEqual({ ...KEY, name: 'Marker', type: 'REG_NONE' });
  });
});

describe('registry.deleteValue', () => {
  const params = { ...KEY, name: 'Greeting' };

  it('blocks when the value is absent', async () => {
    const preview = await op('registry.deleteValue').preview(params, ctx);
    expect(preview.blockedReason).toBe('The value does not exist.');
  });

  it('deletes the value, backs up the key, and undoes with registry.setValue of the old data', async () => {
    values['Greeting'] = { type: 'REG_MULTI_SZ', data: ['a', 'b'] };
    const preview = await op('registry.deleteValue').preview(params, ctx);
    expect(preview).toMatchObject({ before: 'REG_MULTI_SZ: a | b', after: '(deleted)', noUndo: false });
    calls = [];
    const result = await op('registry.deleteValue').apply(params, preview.precondition, ctx);
    expect(result).toMatchObject({
      outcome: 'applied',
      undo: { kind: 'registry.setValue', params: { ...KEY, name: 'Greeting', type: 'REG_MULTI_SZ', data: ['a', 'b'] } },
    });
    expect(methods()).toEqual(['reg.getValues', 'reg.export', 'reg.deleteValue']);
    expect('Greeting' in values).toBe(false);
    expect(backups).toHaveLength(1);
  });

  it('reports a conflict when the value changed', async () => {
    values['Greeting'] = { type: 'REG_SZ', data: 'a' };
    const preview = await op('registry.deleteValue').preview(params, ctx);
    values['Greeting'] = { type: 'REG_SZ', data: 'b' };
    expect((await op('registry.deleteValue').apply(params, preview.precondition, ctx)).outcome).toBe('conflict');
    expect('Greeting' in values).toBe(true);
  });
});

describe('registry.createKey and registry.deleteKeyIfEmpty', () => {
  it('records a deleteKeyIfEmpty undo when the key was created', async () => {
    keyExists = false;
    const preview = await op('registry.createKey').preview(KEY, ctx);
    expect(preview).toMatchObject({ target: 'HKCU\\Software\\Acme', noUndo: false, precondition: { existed: false } });
    const result = await op('registry.createKey').apply(KEY, preview.precondition, ctx);
    expect(result).toMatchObject({ outcome: 'applied', undo: { kind: 'registry.deleteKeyIfEmpty', params: KEY } });
    expect(calls.at(-1)).toEqual({ method: 'reg.createKey', params: KEY });
  });

  it('records no undo when the key already existed', async () => {
    const preview = await op('registry.createKey').preview(KEY, ctx);
    expect(preview.noUndo).toBe(true);
    expect(preview.warnings).toContain('The key already exists; nothing will change.');
    const result = await op('registry.createKey').apply(KEY, preview.precondition, ctx);
    expect(result.outcome).toBe('applied');
    expect(result.undo).toBeUndefined();
  });

  it('records no undo when the helper reports created:false despite the preview (race)', async () => {
    keyExists = false;
    const preview = await op('registry.createKey').preview(KEY, ctx);
    createResult = false;
    const result = await op('registry.createKey').apply(KEY, preview.precondition, ctx);
    expect(result.outcome).toBe('applied');
    expect(result.undo).toBeUndefined();
  });

  it('conflicts when the key appeared after the preview', async () => {
    keyExists = false;
    const preview = await op('registry.createKey').preview(KEY, ctx);
    keyExists = true;
    expect((await op('registry.createKey').apply(KEY, preview.precondition, ctx)).outcome).toBe('conflict');
  });

  it('requires elevation for HKLM keys', async () => {
    expect((await op('registry.createKey').preview({ ...KEY, hive: 'HKLM' }, ctx)).requiresElevation).toBe(true);
  });

  it('deleteKeyIfEmpty blocks non-empty keys and undoes with createKey when empty', async () => {
    values['A'] = { type: 'REG_SZ', data: 'x' };
    expect((await op('registry.deleteKeyIfEmpty').preview(KEY, ctx)).blockedReason).toMatch(/not empty/);
    values = {};
    subkeys = ['child'];
    expect((await op('registry.deleteKeyIfEmpty').preview(KEY, ctx)).blockedReason).toMatch(/not empty/);
    subkeys = [];
    const preview = await op('registry.deleteKeyIfEmpty').preview(KEY, ctx);
    expect(preview.blockedReason).toBeUndefined();
    const result = await op('registry.deleteKeyIfEmpty').apply(KEY, preview.precondition, ctx);
    expect(result).toMatchObject({ outcome: 'applied', undo: { kind: 'registry.createKey', params: KEY } });
    expect(calls.at(-1)).toEqual({ method: 'reg.deleteKeyIfEmpty', params: KEY });
  });

  it('deleteKeyIfEmpty conflicts when the key gained content', async () => {
    const preview = await op('registry.deleteKeyIfEmpty').preview(KEY, ctx);
    values['A'] = { type: 'REG_SZ', data: 'x' };
    expect((await op('registry.deleteKeyIfEmpty').apply(KEY, preview.precondition, ctx)).outcome).toBe('conflict');
  });
});
