import { hostCrypto } from "@dude/crypto/host";
/**
 * Pure AES-GCM/AES-CBC encrypt/decrypt via native Web Crypto, with a
 * passphrase-derived key (PBKDF2-HMAC-SHA256). A single async
 * `crypto.subtle` call per operation — not CPU-bound, so this runs on the
 * main thread with no Worker, matching `jwt-signer-logic.ts`'s reasoning
 * for its own `crypto.subtle` key-generation calls.
 */

export type AesMode = 'AES-GCM' | 'AES-CBC';

/** OWASP's current (2023+) minimum recommendation for PBKDF2-HMAC-SHA256. */
export const DEFAULT_PBKDF2_ITERATIONS = 600_000;

const GCM_IV_BYTES = 12;
const CBC_IV_BYTES = 16;
const SALT_BYTES = 16;

export interface AesEncryptResult {
  /** `<mode>.<iterations>.<saltB64>.<ivB64>.<ciphertextB64>` — self-describing, so decrypt only needs the passphrase. */
  readonly bundle: string;
}

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

function ivBytesFor(mode: AesMode): number {
  return mode === 'AES-GCM' ? GCM_IV_BYTES : CBC_IV_BYTES;
}

async function deriveAesKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
  mode: AesMode,
): Promise<CryptoKey> {
  const baseKey = await hostCrypto().subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase) as BufferSource,
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return hostCrypto().subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    baseKey,
    { name: mode, length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptAes(
  plaintext: string,
  passphrase: string,
  mode: AesMode,
  iterations: number = DEFAULT_PBKDF2_ITERATIONS,
): Promise<AesEncryptResult> {
  const salt = hostCrypto().getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = hostCrypto().getRandomValues(new Uint8Array(ivBytesFor(mode)));
  const key = await deriveAesKey(passphrase, salt, iterations, mode);

  const ciphertext = await hostCrypto().subtle.encrypt(
    mode === 'AES-GCM' ? { name: 'AES-GCM', iv: iv as BufferSource } : { name: 'AES-CBC', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plaintext) as BufferSource,
  );

  const bundle = [
    mode,
    String(iterations),
    bytesToBase64(salt),
    bytesToBase64(iv),
    bytesToBase64(new Uint8Array(ciphertext)),
  ].join('.');

  return { bundle };
}

export type AesDecryptResult = { readonly ok: true; readonly plaintext: string } | { readonly ok: false; readonly error: string };

export async function decryptAes(bundle: string, passphrase: string): Promise<AesDecryptResult> {
  const parts = bundle.trim().split('.');
  if (parts.length !== 5) {
    return { ok: false, error: 'Ciphertext bundle is malformed — expected mode.iterations.salt.iv.ciphertext.' };
  }
  const [modeRaw, iterationsRaw, saltB64, ivB64, ciphertextB64] = parts;
  if (modeRaw !== 'AES-GCM' && modeRaw !== 'AES-CBC') {
    return { ok: false, error: `Unknown cipher mode "${modeRaw}" in bundle.` };
  }
  const iterations = Number(iterationsRaw);
  if (!Number.isFinite(iterations) || iterations <= 0) {
    return { ok: false, error: `Invalid iteration count "${iterationsRaw}" in bundle.` };
  }

  let salt: Uint8Array;
  let iv: Uint8Array;
  let ciphertext: Uint8Array;
  try {
    salt = base64ToBytes(saltB64);
    iv = base64ToBytes(ivB64);
    ciphertext = base64ToBytes(ciphertextB64);
  } catch {
    return { ok: false, error: 'Ciphertext bundle contains invalid Base64.' };
  }

  const mode: AesMode = modeRaw;
  const key = await deriveAesKey(passphrase, salt, iterations, mode);

  try {
    const plaintextBytes = await hostCrypto().subtle.decrypt(
      mode === 'AES-GCM' ? { name: 'AES-GCM', iv: iv as BufferSource } : { name: 'AES-CBC', iv: iv as BufferSource },
      key,
      ciphertext as BufferSource,
    );
    return { ok: true, plaintext: new TextDecoder('utf-8', { fatal: true }).decode(plaintextBytes) };
  } catch {
    // AES-GCM throws on auth-tag mismatch (wrong passphrase/tampered ciphertext);
    // AES-CBC throws on bad PKCS#7 padding for most wrong passphrases, but a
    // wrong passphrase can occasionally still produce valid-looking padding
    // with garbage plaintext — the UTF-8 `fatal: true` decode above catches
    // most of those remaining cases by rejecting non-UTF-8 byte sequences.
    return { ok: false, error: 'Decryption failed — wrong passphrase, or the ciphertext is corrupted/tampered.' };
  }
}
