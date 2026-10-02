import { describe, expect, it } from 'vitest';
import { decryptAes, encryptAes } from "./aes-cipher.js";

describe('aes-cipher', () => {
  const LOW_ITERATIONS = 1000; // keep tests fast; correctness doesn't depend on iteration count

  for (const mode of ['AES-GCM', 'AES-CBC'] as const) {
    describe(mode, () => {
      it('round-trips plaintext through encrypt then decrypt', async () => {
        const plaintext = 'The quick brown fox jumps over the lazy dog. 🦊';
        const { bundle } = await encryptAes(plaintext, 'correct horse battery staple', mode, LOW_ITERATIONS);
        const result = await decryptAes(bundle, 'correct horse battery staple');
        expect(result.ok).toBe(true);
        expect(result.ok && result.plaintext).toBe(plaintext);
      });

      it('round-trips empty plaintext', async () => {
        const { bundle } = await encryptAes('', 'passphrase', mode, LOW_ITERATIONS);
        const result = await decryptAes(bundle, 'passphrase');
        expect(result.ok).toBe(true);
        expect(result.ok && result.plaintext).toBe('');
      });

      it('fails decryption with a clear error on wrong passphrase', async () => {
        const { bundle } = await encryptAes('secret message', 'right passphrase', mode, LOW_ITERATIONS);
        const result = await decryptAes(bundle, 'wrong passphrase');
        expect(result.ok).toBe(false);
        expect(result.ok || result.error).toMatch(/decryption failed/i);
      });

      it('produces different ciphertext for the same plaintext+passphrase across calls (random IV/salt)', async () => {
        const a = await encryptAes('same plaintext', 'same passphrase', mode, LOW_ITERATIONS);
        const b = await encryptAes('same plaintext', 'same passphrase', mode, LOW_ITERATIONS);
        expect(a.bundle).not.toBe(b.bundle);
      });

      it('embeds the mode and iteration count in the bundle so decrypt needs only the passphrase', async () => {
        const { bundle } = await encryptAes('x', 'p', mode, LOW_ITERATIONS);
        const [modeField, iterationsField] = bundle.split('.');
        expect(modeField).toBe(mode);
        expect(iterationsField).toBe(String(LOW_ITERATIONS));
      });
    });
  }

  it('rejects a malformed bundle with a clear error', async () => {
    const result = await decryptAes('not-a-valid-bundle', 'passphrase');
    expect(result.ok).toBe(false);
    expect(result.ok || result.error).toMatch(/malformed/i);
  });

  it('rejects an unknown cipher mode in the bundle', async () => {
    const result = await decryptAes('AES-XYZ.1000.AAAA.AAAA.AAAA', 'passphrase');
    expect(result.ok).toBe(false);
    expect(result.ok || result.error).toMatch(/unknown cipher mode/i);
  });

  // DUDE_PRD.md §21 Phase 23 Item 3 -- cross-checked against Node's `crypto` module (a
  // genuinely independent implementation from the browser's Web Crypto/BoringSSL: Node's
  // `crypto` is OpenSSL-backed), not just DUDE's own encrypt/decrypt agreeing with itself.
  // Bundles below were built with a fixed salt/iv via `pbkdf2Sync`/`createCipheriv`, so this
  // exercises the exact same PBKDF2-HMAC-SHA256 key derivation and AES-GCM/CBC decryption
  // decryptAes performs, against ciphertext DUDE's own code never touched.
  describe('cross-checked against Node crypto (independent implementation)', () => {
    const passphrase = 'correct horse battery staple';
    const iterations = 600_000;
    const saltB64 = 'AQIDBAUGBwgJCgsMDQ4PEA==';
    const plaintext = 'DUDE cross-check plaintext';

    it('decrypts an AES-256-GCM bundle built independently with pbkdf2Sync + createCipheriv', async () => {
      const bundle = [
        'AES-GCM',
        String(iterations),
        saltB64,
        'AAECAwQFBgcICQoL',
        'mF4J2q41mjDudoLklz0Z8twVIh0LuTJgI5vdcfQYi4AFIhzY8TZcbI41',
      ].join('.');

      await expect(decryptAes(bundle, passphrase)).resolves.toEqual({ ok: true, plaintext });
    });

    it('decrypts an AES-256-CBC bundle built independently with pbkdf2Sync + createCipheriv', async () => {
      const bundle = [
        'AES-CBC',
        String(iterations),
        saltB64,
        'AAECAwQFBgcICQoLDA0ODw==',
        '6ezCUno+uul7S4Z6cIAGhlRWpxkp4ZE3cW3UWCS7Oo4=',
      ].join('.');

      await expect(decryptAes(bundle, passphrase)).resolves.toEqual({ ok: true, plaintext });
    });
  });
});
