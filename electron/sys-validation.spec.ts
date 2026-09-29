import { describe, expect, it } from 'vitest';
import { SYS_READ_METHODS } from '../src/shared-logic/system/system-types';
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
});
