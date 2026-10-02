import { createPublicKey, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createDeviceKey, loadDeviceKey, signWithDeviceKey } from './device-key';
import type { DpapiPort } from './windows-sys-client';

/** TEST-ONLY fake: reversible tag + reverse "wrap" bound to entropy. Provides no secrecy. */
function fakeDpapi(): DpapiPort {
  const tag = (e?: Uint8Array) => Buffer.from(e ?? []).toString('hex');
  return {
    async protect(data, entropy) { return new Uint8Array(Buffer.concat([Buffer.from(tag(entropy) + '|'), Buffer.from(data).reverse()])); },
    async unprotect(blob, entropy) {
      const buf = Buffer.from(blob);
      const sep = buf.indexOf('|');
      if (buf.subarray(0, sep).toString() !== tag(entropy)) throw new Error('The data is invalid.');
      return new Uint8Array(buf.subarray(sep + 1).reverse());
    },
  };
}

describe('device key', () => {
  it('creates, loads, signs and verifies', async () => {
    const dpapi = fakeDpapi();
    const created = await createDeviceKey(dpapi);
    expect(created.publicKeyRaw).toHaveLength(32);
    const key = await loadDeviceKey(dpapi, created.wrappedPrivateKey);
    const message = new TextEncoder().encode('hello');
    const sig = signWithDeviceKey(key, message);
    expect(sig).toHaveLength(64);
    const pub = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(created.publicKeyRaw).toString('base64url') }, format: 'jwk' });
    expect(verify(null, message, pub, sig)).toBe(true);
    expect(verify(null, new TextEncoder().encode('other'), pub, sig)).toBe(false);
  });

  it('fails to unwrap with the wrong entropy', async () => {
    const dpapi = fakeDpapi();
    const created = await createDeviceKey(dpapi);
    await expect(dpapi.unprotect(created.wrappedPrivateKey, new TextEncoder().encode('wrong'))).rejects.toThrow();
  });
});
