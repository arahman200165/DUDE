import { describe, expect, it, vi } from 'vitest';
import { parseMachineGuid, readMachineGuid } from './machine-fingerprint';

const SAMPLE = '\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography\r\n    MachineGuid    REG_SZ    4F2A9C10-7B3E-4D5A-8C61-0123456789AB\r\n\r\n';

describe('machine fingerprint', () => {
  it('parses the GUID out of reg.exe output', () => {
    expect(parseMachineGuid(SAMPLE)).toBe('4f2a9c10-7b3e-4d5a-8c61-0123456789ab');
  });

  it('returns null for output without a GUID', () => {
    expect(parseMachineGuid('ERROR: The system was unable to find the specified registry key or value.')).toBeNull();
    expect(parseMachineGuid('MachineGuid REG_SZ not-a-guid')).toBeNull();
  });

  it('runs reg.exe without a shell, hidden, with a 2 s timeout', async () => {
    const exec = vi.fn().mockResolvedValue(SAMPLE);
    expect(await readMachineGuid(exec, 'win32')).toBe('4f2a9c10-7b3e-4d5a-8c61-0123456789ab');
    expect(exec).toHaveBeenCalledWith('reg.exe', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { shell: false, windowsHide: true, timeout: 2000 });
  });

  it('passes a real backslash-separated key path (regression: single backslashes collapsed the path)', async () => {
    const exec = vi.fn().mockResolvedValue(SAMPLE);
    await readMachineGuid(exec, 'win32');
    const key = (exec.mock.calls[0][1] as string[])[1];
    expect(key.split('\\')).toEqual(['HKLM', 'SOFTWARE', 'Microsoft', 'Cryptography']);
  });

  it('is null on failure and on other platforms', async () => {
    expect(await readMachineGuid(vi.fn().mockRejectedValue(new Error('timeout')), 'win32')).toBeNull();
    const exec = vi.fn();
    expect(await readMachineGuid(exec, 'linux')).toBeNull();
    expect(exec).not.toHaveBeenCalled();
  });
});
