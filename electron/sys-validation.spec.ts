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
    for (const method of ['helper.info', 'process.list', 'net.tcp', 'net.udp']) {
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
});
