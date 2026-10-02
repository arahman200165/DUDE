import { existsSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { createDeviceKey, loadDeviceKey, signWithDeviceKey } from './device-key';
import { dpapiProtect, dpapiUnprotect, resolveHelperPath, stopWindowsSysClient, windowsDpapi } from './windows-sys-client';

const helper = process.platform === 'win32' ? resolveHelperPath() : null;
const real = helper !== null && existsSync(helper);
const enc = (s: string) => new TextEncoder().encode(s);

describe('resolveHelperPath', () => {
  it('prefers the explicit flag, then env, then beside the executable', () => {
    const all = () => true;
    expect(resolveHelperPath(['n', 's', '--helper', 'C:\\x\\h.exe'], {}, 'C:\\a\\b.exe', all)).toMatch(/h\.exe$/);
    expect(resolveHelperPath(['n', 's'], { DUDE_WINDOWS_SYS_HELPER: 'C:\\e\\h.exe' }, 'C:\\a\\b.exe', all)).toMatch(/h\.exe$/);
    expect(resolveHelperPath(['n', 's'], {}, 'C:\\a\\b.exe', all)).toMatch(/windows-sys\.exe$/);
    expect(resolveHelperPath(['n', 's', '--helper', 'C:\\x\\h.exe'], {}, 'C:\\a\\b.exe', () => false)).toBeNull();
  });
});

describe.skipIf(process.platform === 'win32')('dpapi off Windows', () => {
  it('throws dpapi-unavailable', async () => {
    await expect(dpapiProtect(enc('x'))).rejects.toThrow('dpapi-unavailable');
  });
});

describe.skipIf(!real)('real windows-sys.exe DPAPI', () => {
  afterAll(() => stopWindowsSysClient());

  it('round-trips with and without entropy', async () => {
    const blob = await dpapiProtect(enc('secret'), enc('e1'));
    expect(Buffer.from(blob).includes(Buffer.from('secret'))).toBe(false);
    expect(new TextDecoder().decode(await dpapiUnprotect(blob, enc('e1')))).toBe('secret');
    const plain = await dpapiProtect(enc('abc'));
    expect(new TextDecoder().decode(await dpapiUnprotect(plain))).toBe('abc');
  });

  it('rejects a tampered blob and mismatched entropy', async () => {
    const blob = await dpapiProtect(enc('secret'), enc('e1'));
    await expect(dpapiUnprotect(blob, enc('e2'))).rejects.toThrow();
    const bad = new Uint8Array(blob);
    bad[bad.length - 1] ^= 0xff;
    await expect(dpapiUnprotect(bad, enc('e1'))).rejects.toThrow();
  });

  it('rejects oversize input', async () => {
    await expect(dpapiProtect(new Uint8Array(64 * 1024 + 1))).rejects.toThrow(/64 KiB/);
  });

  it('wraps a real device key end to end', async () => {
    const created = await createDeviceKey(windowsDpapi);
    const key = await loadDeviceKey(windowsDpapi, created.wrappedPrivateKey);
    expect(signWithDeviceKey(key, enc('m'))).toHaveLength(64);
  });
});
