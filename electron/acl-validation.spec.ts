import { describe, expect, it } from 'vitest';
import { validateSysCall } from './sys-validation';

describe('ACL inspection RPC validation', () => {
  it('accepts granted-target shaped file and registry requests', () => {
    expect(validateSysCall('acl.get', { target: { kind: 'file', path: 'C:\\work\\file.txt' }, account: 'DOMAIN\\alice' }).params)
      .toEqual({ target: { kind: 'file', path: 'C:\\work\\file.txt' }, account: 'DOMAIN\\alice' });
    expect(validateSysCall('acl.get', { target: { kind: 'registry', hive: 'HKLM', path: 'Software\\Vendor', view: '64' } }).method).toBe('acl.get');
  });

  it('rejects malformed targets and control characters', () => {
    for (const params of [
      {}, { target: { kind: 'file', path: 'relative' } },
      { target: { kind: 'registry', hive: 'HKXX', path: 'x', view: '64' } },
      { target: { kind: 'file', path: 'C:\\x', extra: 1 } },
      { target: { kind: 'file', path: 'C:\\x' }, account: 'bad\nname' },
      { target: { kind: 'file', path: 'C:\\x' }, extra: true },
    ]) expect(() => validateSysCall('acl.get', params)).toThrow();
  });
});
