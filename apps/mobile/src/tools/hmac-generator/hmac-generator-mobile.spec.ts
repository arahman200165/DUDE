import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hexToBase64, hmacFor } from './hmac-generator-mobile';
import { installEngineHost } from '@dude/crypto/host';

// The engines draw randomness and SubtleCrypto from the host; Node provides the same WebCrypto surface the Android host adapts.
installEngineHost({ crypto: () => globalThis.crypto } as unknown as Parameters<typeof installEngineHost>[0]);

describe('hexToBase64', () => {
  it('matches Node for lengths with 0, 1 and 2 padding bytes', () => {
    for (const hex of ['', '00', 'ff10', 'deadbeef', '0b0b0b0b0b0b', 'a0f14ba018012b764b32dc157ce0a20e8322dae09da80cae035670ce0879e5d4']) {
      expect(hexToBase64(hex)).toBe(Buffer.from(hex, 'hex').toString('base64'));
    }
  });
});

describe('hmacFor', () => {
  // Same value as RFC 4231 test case 2 without the trailing "?" (the Maestro journey types this form).
  const message = 'what do ya want for nothing';
  it('returns hex and base64 output for the same HMAC', async () => {
    const expected = createHmac('sha256', 'Jefe').update(message).digest();
    await expect(hmacFor(message, 'Jefe', 'utf8', 'SHA-256', 'hex')).resolves.toEqual({ ok: true, value: expected.toString('hex') });
    await expect(hmacFor(message, 'Jefe', 'utf8', 'SHA-256', 'base64')).resolves.toEqual({ ok: true, value: expected.toString('base64') });
  });
  it('passes the engine key errors through', async () => {
    await expect(hmacFor(message, 'Jefe', 'hex', 'SHA-1', 'hex')).resolves.toEqual({ ok: false, error: 'Contains non-hex characters.' });
    await expect(hmacFor(message, '', 'utf8', 'SHA-1', 'hex')).resolves.toEqual({ ok: false, error: 'Enter a key.' });
  });
});
