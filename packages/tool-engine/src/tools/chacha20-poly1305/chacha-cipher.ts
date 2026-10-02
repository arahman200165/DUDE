import { hostCrypto } from "@dude/crypto/host";
/**
 * Pure ChaCha20-Poly1305 / XChaCha20-Poly1305 encrypt/decrypt, with a
 * passphrase-derived key (PBKDF2-HMAC-SHA256, native Web Crypto). RFC 8439
 * has no native browser cipher, so the AEAD itself runs via `@noble/ciphers`
 * — framework-free and Worker-compatible, matching `aes-cipher.ts`'s bundle
 * shape and error-handling style for a consistent UX across both tools.
 */

import { chacha20poly1305, xchacha20poly1305 } from '@noble/ciphers/chacha.js';

export type ChachaVariant = 'xchacha20poly1305' | 'chacha20poly1305';

/** OWASP's current (2023+) minimum recommendation for PBKDF2-HMAC-SHA256. */
export const DEFAULT_PBKDF2_ITERATIONS = 600_000;

const NONCE_BYTES: Record<ChachaVariant, number> = {
  xchacha20poly1305: 24,
  chacha20poly1305: 12,
};
const SALT_BYTES = 16;
const KEY_BYTES = 32;

export interface ChachaEncryptResult {
  /** `<variant>.<iterations>.<saltB64>.<nonceB64>.<ciphertextB64>` — self-describing, so decrypt only needs the passphrase. */
  readonly bundle: string;
}

export type ChachaDecryptResult = { readonly ok: true; readonly plaintext: string } | { readonly ok: false; readonly error: string };

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveChachaKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const baseKey = await hostCrypto().subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase) as BufferSource,
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await hostCrypto().subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    baseKey,
    KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
}

function createCipher(variant: ChachaVariant, key: Uint8Array, nonce: Uint8Array) {
  return variant === 'xchacha20poly1305' ? xchacha20poly1305(key, nonce) : chacha20poly1305(key, nonce);
}

export async function encryptChaCha(
  plaintext: string,
  passphrase: string,
  variant: ChachaVariant,
  iterations: number = DEFAULT_PBKDF2_ITERATIONS,
): Promise<ChachaEncryptResult> {
  const salt = hostCrypto().getRandomValues(new Uint8Array(SALT_BYTES));
  const nonce = hostCrypto().getRandomValues(new Uint8Array(NONCE_BYTES[variant]));
  const key = await deriveChachaKey(passphrase, salt, iterations);

  const ciphertext = createCipher(variant, key, nonce).encrypt(new TextEncoder().encode(plaintext));

  const bundle = [
    variant,
    String(iterations),
    bytesToBase64(salt),
    bytesToBase64(nonce),
    bytesToBase64(ciphertext),
  ].join('.');

  return { bundle };
}

export async function decryptChaCha(bundle: string, passphrase: string): Promise<ChachaDecryptResult> {
  const parts = bundle.trim().split('.');
  if (parts.length !== 5) {
    return { ok: false, error: 'Ciphertext bundle is malformed — expected variant.iterations.salt.nonce.ciphertext.' };
  }
  const [variantRaw, iterationsRaw, saltB64, nonceB64, ciphertextB64] = parts;
  if (variantRaw !== 'xchacha20poly1305' && variantRaw !== 'chacha20poly1305') {
    return { ok: false, error: `Unknown cipher variant "${variantRaw}" in bundle.` };
  }
  const iterations = Number(iterationsRaw);
  if (!Number.isFinite(iterations) || iterations <= 0) {
    return { ok: false, error: `Invalid iteration count "${iterationsRaw}" in bundle.` };
  }

  let salt: Uint8Array;
  let nonce: Uint8Array;
  let ciphertext: Uint8Array;
  try {
    salt = base64ToBytes(saltB64);
    nonce = base64ToBytes(nonceB64);
    ciphertext = base64ToBytes(ciphertextB64);
  } catch {
    return { ok: false, error: 'Ciphertext bundle contains invalid Base64.' };
  }

  const variant: ChachaVariant = variantRaw;
  if (nonce.length !== NONCE_BYTES[variant]) {
    return { ok: false, error: `Nonce length in bundle does not match ${variant} (expected ${NONCE_BYTES[variant]} bytes).` };
  }

  const key = await deriveChachaKey(passphrase, salt, iterations);

  try {
    const plaintextBytes = createCipher(variant, key, nonce).decrypt(ciphertext);
    return { ok: true, plaintext: new TextDecoder('utf-8', { fatal: true }).decode(plaintextBytes) };
  } catch {
    // Poly1305 tag verification throws on a wrong passphrase or tampered
    // ciphertext, unlike AES-CBC's silent-garbage failure mode — this is a
    // genuine AEAD, so this catch is the one and only failure path.
    return { ok: false, error: 'Decryption failed — wrong passphrase, or the ciphertext is corrupted/tampered.' };
  }
}
