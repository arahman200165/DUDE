import { describe, expect, it } from 'vitest';
import { computeHmac } from "./hmac-generator-logic.js";

// RFC 4231 test vectors, values cross-checked against Node's `crypto.createHmac`.
describe('computeHmac', () => {
  const tc1KeyHex = '0b'.repeat(20);

  it('matches RFC 4231 Test Case 1 (hex key) for SHA-1/256/384/512', async () => {
    await expect(computeHmac('Hi There', tc1KeyHex, 'hex', 'SHA-1')).resolves.toEqual({
      ok: true,
      value: 'b617318655057264e28bc0b6fb378c8ef146be00',
    });
    await expect(computeHmac('Hi There', tc1KeyHex, 'hex', 'SHA-256')).resolves.toEqual({
      ok: true,
      value: 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7',
    });
    await expect(computeHmac('Hi There', tc1KeyHex, 'hex', 'SHA-384')).resolves.toEqual({
      ok: true,
      value: 'afd03944d84895626b0825f4ab46907f15f9dadbe4101ec682aa034c7cebc59cfaea9ea9076ede7f4af152e8b2fa9cb6',
    });
    await expect(computeHmac('Hi There', tc1KeyHex, 'hex', 'SHA-512')).resolves.toEqual({
      ok: true,
      value:
        '87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cdedaa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854',
    });
  });

  it('matches RFC 4231 Test Case 2 (UTF-8 key "Jefe") for SHA-256/384/512', async () => {
    const data = 'what do ya want for nothing?';
    await expect(computeHmac(data, 'Jefe', 'utf8', 'SHA-256')).resolves.toEqual({
      ok: true,
      value: '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    });
    await expect(computeHmac(data, 'Jefe', 'utf8', 'SHA-384')).resolves.toEqual({
      ok: true,
      value: 'af45d2e376484031617f78d2b58a6b1b9c7ef464f5a01b47e42ec3736322445e8e2240ca5e69e2c78b3239ecfab21649',
    });
    await expect(computeHmac(data, 'Jefe', 'utf8', 'SHA-512')).resolves.toEqual({
      ok: true,
      value:
        '164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea2505549758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737',
    });
  });

  it('accepts a Base64-encoded key and matches the equivalent hex key', async () => {
    const keyBytes = tc1KeyHex.match(/../g)!.map((byte) => parseInt(byte, 16));
    const keyBase64 = btoa(String.fromCharCode(...keyBytes));
    const viaBase64 = await computeHmac('Hi There', keyBase64, 'base64', 'SHA-256');
    const viaHex = await computeHmac('Hi There', tc1KeyHex, 'hex', 'SHA-256');
    expect(viaBase64).toEqual(viaHex);
  });

  it('rejects an empty key', async () => {
    await expect(computeHmac('message', '', 'utf8', 'SHA-256')).resolves.toEqual({
      ok: false,
      error: 'Enter a key.',
    });
  });

  it('rejects invalid hex in the key', async () => {
    const result = await computeHmac('message', 'zz', 'hex', 'SHA-256');
    expect(result.ok).toBe(false);
  });

  it('rejects invalid Base64 in the key', async () => {
    const result = await computeHmac('message', '***not base64***', 'base64', 'SHA-256');
    expect(result.ok).toBe(false);
  });
});
