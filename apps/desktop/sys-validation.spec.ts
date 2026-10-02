import { describe, expect, it } from 'vitest';
import { SYS_READ_METHODS } from "@dude/contracts/system/system-types";
import { validateSysCall } from './sys-validation';

const reg = (over: Record<string, unknown> = {}) => ({ hive: 'HKLM', path: 'SOFTWARE\\Microsoft', view: 'default', ...over });

describe('validateSysCall', () => {
  it('rejects unknown and non-string methods', () => {
    for (const method of ['process.kill', 'reg.setValue', '', 'toString', 42, null, undefined, {}]) {
      expect(() => validateSysCall(method, {})).toThrow(/Unknown system method/);
    }
  });

  it('normalizes empty params for parameterless methods', () => {
    for (const method of ['helper.info', 'process.list', 'svc.list', 'net.tcp', 'net.udp']) {
      expect(SYS_READ_METHODS).toContain(method);
      for (const params of [undefined, null, {}, Object.create(null)]) {
        expect(validateSysCall(method, params)).toEqual({ method, params: {} });
      }
    }
  });

  it('rejects params on parameterless methods and non-plain objects', () => {
    expect(() => validateSysCall('process.list', { pid: 1 })).toThrow();
    expect(() => validateSysCall('process.list', [])).toThrow();
    expect(() => validateSysCall('process.list', 'x')).toThrow();
    expect(() => validateSysCall('net.tcp', new Map())).toThrow();
  });

  it('accepts valid registry params, including the hive root', () => {
    expect(validateSysCall('reg.enumKey', reg())).toEqual({ method: 'reg.enumKey', params: reg() });
    expect(validateSysCall('reg.getValues', reg({ path: '', hive: 'HKCU', view: '32' })).params).toEqual(reg({ path: '', hive: 'HKCU', view: '32' }));
    for (const hive of ['HKLM', 'HKCU', 'HKCR', 'HKU', 'HKCC']) expect(() => validateSysCall('reg.enumKey', reg({ hive }))).not.toThrow();
    for (const view of ['default', '64', '32']) expect(() => validateSysCall('reg.enumKey', reg({ view }))).not.toThrow();
  });

  it('rejects registry params that are missing, extra, or the wrong shape', () => {
    expect(() => validateSysCall('reg.enumKey', undefined)).toThrow();
    expect(() => validateSysCall('reg.enumKey', {})).toThrow();
    expect(() => validateSysCall('reg.enumKey', { hive: 'HKLM', path: '' })).toThrow();
    expect(() => validateSysCall('reg.enumKey', { ...reg(), extra: 1 })).toThrow(/exactly/);
    expect(() => validateSysCall('reg.enumKey', [reg()])).toThrow();
    class Params { hive = 'HKLM'; path = ''; view = 'default'; }
    expect(() => validateSysCall('reg.enumKey', new Params())).toThrow();
    const proto = Object.create({ inherited: true }) as Record<string, unknown>;
    Object.assign(proto, reg());
    expect(() => validateSysCall('reg.getValues', proto)).toThrow();
  });

  it('validates svc.config: exact name key and name rules', () => {
    expect(validateSysCall('svc.config', { name: 'Spooler' })).toEqual({ method: 'svc.config', params: { name: 'Spooler' } });
    expect(() => validateSysCall('svc.config', undefined)).toThrow();
    expect(() => validateSysCall('svc.config', {})).toThrow(/exactly/);
    expect(() => validateSysCall('svc.config', { name: 'A', extra: 1 })).toThrow(/exactly/);
    for (const name of ['', 'a'.repeat(257), 'a/b', 'a\\b', 'a\u0000b', 'a\nb', 5, null]) {
      expect(() => validateSysCall('svc.config', { name })).toThrow();
    }
    expect(() => validateSysCall('svc.config', { name: 'a'.repeat(256) })).not.toThrow();
  });

  it('validates evt.channels, evt.query and evt.queryFile', () => {
    expect(validateSysCall('evt.channels', undefined)).toEqual({ method: 'evt.channels', params: {} });
    expect(() => validateSysCall('evt.channels', { a: 1 })).toThrow();
    const ok = { channel: 'System', xpath: '*[System[(Level=2)]]', reverse: false, afterRecordId: '123', limit: 50 };
    expect(validateSysCall('evt.query', ok)).toEqual({ method: 'evt.query', params: ok });
    expect(validateSysCall('evt.query', { channel: 'Microsoft-Windows-X/Operational' }).params).toEqual({ channel: 'Microsoft-Windows-X/Operational' });
    for (const bad of [undefined, {}, { channel: '' }, { channel: 'a'.repeat(513) }, { channel: 'a\u0000b' }, { channel: 5 },
      { channel: 'S', extra: 1 }, { channel: 'S', xpath: 5 }, { channel: 'S', xpath: 'x'.repeat(8193) },
      { channel: 'S', afterRecordId: '-1' }, { channel: 'S', afterRecordId: 5 }, { channel: 'S', reverse: 'yes' },
      { channel: 'S', limit: 0 }, { channel: 'S', limit: 1.5 }, { channel: 'S', limit: 1001 }, { channel: 'S', afterRecordId: '18446744073709551616' }, { channel: 'S', path: 'C:\\a.evtx' }]) {
      expect(() => validateSysCall('evt.query', bad)).toThrow();
    }
    const file = { path: 'C:\\logs\\a.EVTX', xpath: '*', reverse: true, limit: 10 };
    expect(validateSysCall('evt.queryFile', file)).toEqual({ method: 'evt.queryFile', params: file });
    for (const bad of [undefined, {}, { path: 'C:\\logs\\a.txt' }, { path: 'a.evtx' }, { path: 'C:\\a.evtx', channel: 'S' },
      { path: 'C:\\a.evtx', afterRecordId: '1' }, { path: 'C:\\a.evtx', limit: -1 }]) {
      expect(() => validateSysCall('evt.queryFile', bad)).toThrow();
    }
  });

  it('rejects bad hive and view values', () => {
    for (const hive of ['hklm', 'HKEY_LOCAL_MACHINE', '', 1, null]) expect(() => validateSysCall('reg.enumKey', reg({ hive }))).toThrow(/hive/);
    for (const view of ['128', 'Default', '', 64, null]) expect(() => validateSysCall('reg.enumKey', reg({ view }))).toThrow(/view/);
  });

  it('enforces registry path rules', () => {
    for (const path of ['\\SOFTWARE', 'SOFTWARE\\', 'A\\\\B', '\\', 'A\\B\\\\']) expect(() => validateSysCall('reg.enumKey', reg({ path }))).toThrow();
    for (const path of ['A\u0000B', 'A\nB', 'A\tB', 'A\u001fB']) expect(() => validateSysCall('reg.enumKey', reg({ path }))).toThrow(/control/);
    expect(() => validateSysCall('reg.enumKey', reg({ path: 5 }))).toThrow();
    expect(() => validateSysCall('reg.enumKey', reg({ path: 'a'.repeat(1025) }))).toThrow(/too long/);
    expect(() => validateSysCall('reg.enumKey', reg({ path: 'a'.repeat(256) }))).toThrow(/too long/);
    expect(() => validateSysCall('reg.enumKey', reg({ path: 'a'.repeat(255) }))).not.toThrow();
    const long = Array.from({ length: 4 }, () => 'a'.repeat(255)).join('\\');
    expect(long.length).toBeLessThanOrEqual(1024);
    expect(() => validateSysCall('reg.enumKey', reg({ path: long }))).not.toThrow();
    expect(() => validateSysCall('reg.enumKey', reg({ path: `${long}\\${'a'.repeat(255)}` }))).toThrow(/too long/);
  });

  it('accepts exact process references and rejects malformed ones', () => {
    for (const method of ['process.detail', 'process.modules', 'process.handles']) {
      const ok = { pid: 4321, startKey: '133700000000000000' };
      expect(validateSysCall(method, ok)).toEqual({ method, params: ok });
      expect(() => validateSysCall(method, { pid: 0, startKey: '0' })).not.toThrow();
      expect(() => validateSysCall(method, { pid: 4294967295, startKey: '9'.repeat(20) })).not.toThrow();
      for (const bad of [undefined, null, [], 'x', {}, { pid: 1 }, { startKey: '1' }, { ...ok, extra: 1 }]) expect(() => validateSysCall(method, bad)).toThrow();
      for (const pid of [-1, 1.5, 4294967296, NaN, Infinity, '1', null]) expect(() => validateSysCall(method, { ...ok, pid })).toThrow(/Process id/);
      for (const startKey of ['', 'abc', '-1', '1.5', ' 1', '1'.repeat(21), 1, null]) expect(() => validateSysCall(method, { ...ok, startKey })).toThrow(/start key/);
    }
  });

  it('accepts exactly { pid } for process.threads', () => {
    expect(validateSysCall('process.threads', { pid: 7 })).toEqual({ method: 'process.threads', params: { pid: 7 } });
    for (const bad of [undefined, {}, { pid: 7, startKey: '1' }, { pid: -1 }, { pid: '7' }, []]) expect(() => validateSysCall('process.threads', bad)).toThrow();
  });

  it('validates fs.probeDirs params', () => {
    expect(validateSysCall('fs.probeDirs', { dirs: ['C:\\Windows'] })).toEqual({ method: 'fs.probeDirs', params: { dirs: ['C:\\Windows'] } });
    expect(validateSysCall('fs.probeDirs', { dirs: ['C:\\a', '\\\\srv\\s'], extensions: ['.EXE', '.cmd'] }).params).toEqual({ dirs: ['C:\\a', '\\\\srv\\s'], extensions: ['.exe', '.cmd'] });
    const many = Array.from({ length: 256 }, () => 'C:\\a');
    expect(() => validateSysCall('fs.probeDirs', { dirs: many })).not.toThrow();
    for (const bad of [
      undefined, [], {}, { dirs: [] }, { dirs: 'C:\\a' }, { dirs: [...many, 'C:\\b'] }, { dirs: ['relative'] }, { dirs: ['C:\\a\u0000'] }, { dirs: [5] },
      { dirs: ['C:\\a'], extensions: 'exe' }, { dirs: ['C:\\a'], extensions: ['exe'] }, { dirs: ['C:\\a'], extensions: ['.'] }, { dirs: ['C:\\a'], extensions: ['.e x'] },
      { dirs: ['C:\\a'], extensions: [1] }, { dirs: ['C:\\a'], extensions: Array.from({ length: 65 }, () => '.exe') }, { dirs: ['C:\\a'], extra: 1 },
    ]) expect(() => validateSysCall('fs.probeDirs', bad)).toThrow();
  });

  it('validates absolute Windows file paths for file.version and file.signature', () => {
    for (const method of ['file.version', 'file.signature']) {
      for (const path of ['C:\\Windows\\notepad.exe', 'c:/windows/notepad.exe', '\\\\server\\share\\a.dll', '\\\\?\\C:\\a.dll', `C:\\${'a'.repeat(32764)}`]) {
        expect(validateSysCall(method, { path })).toEqual({ method, params: { path } });
      }
      for (const path of ['', 'notepad.exe', '..\\a.dll', 'C:a.dll', '\\\\', '\\\\\\a', 'C:\\a\u0000b', 'C:\\a\nb', 'C:\\a\u007f', `C:\\${'a'.repeat(32765)}`, 5, null]) {
        expect(() => validateSysCall(method, { path })).toThrow();
      }
      for (const bad of [undefined, {}, [], { path: 'C:\\a', extra: 1 }, { file: 'C:\\a' }]) expect(() => validateSysCall(method, bad)).toThrow();
    }
  });

  it('validates reg.search params with optional flags and limits', () => {
    const search = (over: Record<string, unknown> = {}) => ({ ...reg(), query: 'foo', ...over });
    expect(validateSysCall('reg.search', search()).params).toEqual(search());
    const full = search({ regex: true, caseSensitive: false, matchKeys: true, matchValueNames: false, matchValueData: true, limit: 50, timeBudgetMs: 2000 });
    expect(validateSysCall('reg.search', full).params).toEqual(full);
    for (const bad of [
      undefined, [], reg(), search({ query: '' }), search({ query: 'x'.repeat(1025) }), search({ query: 5 }), search({ extra: 1 }),
      search({ regex: 'yes' }), search({ limit: 0 }), search({ limit: 1.5 }), search({ timeBudgetMs: -1 }), search({ hive: 'HKXX' }),
      search({ view: '16' }), search({ path: '\bad' }), search({ recursive: true }),
    ]) expect(() => validateSysCall('reg.search', bad)).toThrow();
  });

  it('validates reg.export params', () => {
    expect(validateSysCall('reg.export', reg()).params).toEqual(reg());
    expect(validateSysCall('reg.export', reg({ recursive: false })).params).toEqual(reg({ recursive: false }));
    for (const bad of [undefined, [], reg({ recursive: 'no' }), reg({ query: 'x' }), reg({ hive: 'nope' }), reg({ view: 'x' }), { hive: 'HKLM', view: 'default' }]) {
      expect(() => validateSysCall('reg.export', bad)).toThrow();
    }
  });
  it('accepts bounded SID decode and lookup inputs', () => {
    expect(validateSysCall('sid.decode', { inputFormat: 'sid', input: 'S-1-5-18' })).toEqual({ method: 'sid.decode', params: { inputFormat: 'sid', input: 'S-1-5-18' } });
    expect(validateSysCall('sid.decode', { inputFormat: 'binary-hex', input: '010100000000000512000000' }).method).toBe('sid.decode');
    expect(validateSysCall('sid.decode', { inputFormat: 'binary-base64', input: 'AQEAAAAAAAUAAAAA' }).method).toBe('sid.decode');
    expect(validateSysCall('sid.lookup', { lookupKind: 'account', query: 'DOMAIN\\user' }).params).toEqual({ lookupKind: 'account', query: 'DOMAIN\\user' });
    expect(validateSysCall('sid.lookup', { lookupKind: 'sid', query: 'S-1-5-18' }).method).toBe('sid.lookup');
  });

  it('rejects malformed, extra, and oversized SID parameters before IPC', () => {
    for (const params of [undefined, { inputFormat: 'sid', input: 'S-1-5-18', extra: true }, { inputFormat: 'sid', input: 'not-a-sid' }, { inputFormat: 'binary-hex', input: '12xz' }, { inputFormat: 'binary-base64', input: '!!!!' }, { inputFormat: 'sid', input: 'S-1-5-18\n' }, { inputFormat: 'sid', input: 'x'.repeat(4097) }]) {
      expect(() => validateSysCall('sid.decode', params)).toThrow();
    }
    for (const params of [undefined, { lookupKind: 'account', query: 'x', extra: 1 }, { lookupKind: 'other', query: 'x' }, { lookupKind: 'sid', query: 'user' }, { lookupKind: 'account', query: 'x\0y' }, { lookupKind: 'account', query: 'x'.repeat(513) }]) {
      expect(() => validateSysCall('sid.lookup', params)).toThrow();
    }
  });

  it('allows pe.apisetmap only without parameters', () => {
    expect(SYS_READ_METHODS).toContain('pe.apisetmap');
    expect(validateSysCall('pe.apisetmap', undefined)).toEqual({ method: 'pe.apisetmap', params: {} });
    expect(validateSysCall('pe.apisetmap', {})).toEqual({ method: 'pe.apisetmap', params: {} });
    expect(() => validateSysCall('pe.apisetmap', { path: 'C:\\x.dll' })).toThrow();
    expect(() => validateSysCall('pe.apisetmap', ['x'])).toThrow();
  });

  it('keeps M609 read methods on the allowlist and parameterless calls strict', () => {
    for (const method of ['sid.wellKnown', 'account.token', 'account.localAccounts', 'account.localGroups', 'account.profiles']) {
      expect(SYS_READ_METHODS).toContain(method);
      expect(validateSysCall(method, {})).toEqual({ method, params: {} });
      expect(() => validateSysCall(method, { extra: true })).toThrow();
    }
  });
});
