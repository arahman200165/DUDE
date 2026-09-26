import { describe, expect, it } from 'vitest';
import { decryptChaCha, encryptChaCha } from './chacha-cipher';

describe('chacha-cipher', () => {
  const LOW_ITERATIONS = 1000; // keep tests fast; correctness doesn't depend on iteration count

  for (const variant of ['xchacha20poly1305', 'chacha20poly1305'] as const) {
    describe(variant, () => {
      it('round-trips plaintext through encrypt then decrypt', async () => {
        const plaintext = 'The quick brown fox jumps over the lazy dog. 🦊';
        const { bundle } = await encryptChaCha(plaintext, 'correct horse battery staple', variant, LOW_ITERATIONS);
        const result = await decryptChaCha(bundle, 'correct horse battery staple');
        expect(result.ok).toBe(true);
        expect(result.ok && result.plaintext).toBe(plaintext);
      });

      it('round-trips empty plaintext', async () => {
        const { bundle } = await encryptChaCha('', 'passphrase', variant, LOW_ITERATIONS);
        const result = await decryptChaCha(bundle, 'passphrase');
        expect(result.ok).toBe(true);
        expect(result.ok && result.plaintext).toBe('');
      });

      it('fails decryption with a clear error on wrong passphrase', async () => {
        const { bundle } = await encryptChaCha('secret message', 'right passphrase', variant, LOW_ITERATIONS);
        const result = await decryptChaCha(bundle, 'wrong passphrase');
        expect(result.ok).toBe(false);
        expect(result.ok || result.error).toMatch(/decryption failed/i);
      });

      it('fails decryption with a clear error on tampered ciphertext', async () => {
        const { bundle } = await encryptChaCha('secret message', 'passphrase', variant, LOW_ITERATIONS);
        const parts = bundle.split('.');
        const tampered = base64Flip(parts[4]);
        const result = await decryptChaCha([...parts.slice(0, 4), tampered].join('.'), 'passphrase');
        expect(result.ok).toBe(false);
      });

      it('produces different ciphertext for the same plaintext+passphrase across calls (random salt/nonce)', async () => {
        const a = await encryptChaCha('same plaintext', 'same passphrase', variant, LOW_ITERATIONS);
        const b = await encryptChaCha('same plaintext', 'same passphrase', variant, LOW_ITERATIONS);
        expect(a.bundle).not.toBe(b.bundle);
      });

      it('embeds the variant and iteration count in the bundle so decrypt needs only the passphrase', async () => {
        const { bundle } = await encryptChaCha('x', 'p', variant, LOW_ITERATIONS);
        const [variantField, iterationsField] = bundle.split('.');
        expect(variantField).toBe(variant);
        expect(iterationsField).toBe(String(LOW_ITERATIONS));
      });
    });
  }

  it('rejects a malformed bundle with a clear error', async () => {
    const result = await decryptChaCha('not-a-valid-bundle', 'passphrase');
    expect(result.ok).toBe(false);
    expect(result.ok || result.error).toMatch(/malformed/i);
  });

  it('rejects an unknown cipher variant in the bundle', async () => {
    const result = await decryptChaCha('chacha99poly.1000.AAAA.AAAA.AAAA', 'passphrase');
    expect(result.ok).toBe(false);
    expect(result.ok || result.error).toMatch(/unknown cipher variant/i);
  });

  it('rejects a nonce length that does not match the declared variant', async () => {
    const { bundle } = await encryptChaCha('x', 'p', 'chacha20poly1305', LOW_ITERATIONS);
    const parts = bundle.split('.');
    parts[0] = 'xchacha20poly1305';
    const result = await decryptChaCha(parts.join('.'), 'p');
    expect(result.ok).toBe(false);
    expect(result.ok || result.error).toMatch(/nonce length/i);
  });

  // DUDE_PRD.md §21 Phase 23 Item 3 -- cross-checked against Node's `crypto` module (OpenSSL-
  // backed, independent of @noble/ciphers' pure-JS ChaCha20-Poly1305 and of the browser's Web
  // Crypto PBKDF2). Bundle built with a fixed salt/nonce via `pbkdf2Sync`/`createCipheriv`.
  it('decrypts a chacha20poly1305 bundle built independently with pbkdf2Sync + createCipheriv', async () => {
    const bundle = [
      'chacha20poly1305',
      '600000',
      'AQIDBAUGBwgJCgsMDQ4PEA==',
      'AAECAwQFBgcICQoL',
      'WUlAJVF4djHB3ExK+OeJ/OcOBb4WcczZ8ToO1ZyQ7E6C3QKnqPBhJw2h',
    ].join('.');

    await expect(decryptChaCha(bundle, 'correct horse battery staple')).resolves.toEqual({
      ok: true,
      plaintext: 'DUDE cross-check plaintext',
    });
  });
});

function base64Flip(b64: string): string {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  bytes[0] ^= 0xff;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
