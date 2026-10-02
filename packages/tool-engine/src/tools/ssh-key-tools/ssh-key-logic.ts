import { hostCrypto } from "@dude/crypto/host";
/**
 * SSH key generation, public-key inspection, and fingerprint calculation.
 * Key material comes from `jose`'s native `generateKeyPair` (same pattern as
 * `../asymmetric-key-generator/asymmetric-keygen-logic.ts`); this module's
 * own job is hand-encoding the raw key components into OpenSSH's wire
 * format, since neither `jose` nor `node-forge` speaks it.
 *
 * Private-key export is unencrypted PKCS8 PEM only — no `openssh-key-v1`
 * bcrypt-KDF container. Fingerprints: legacy MD5 (colon-separated hex) via
 * `js-md5` (already a dependency, for the Hash Generator), and the modern
 * default SHA-256 (`SHA256:` + unpadded standard Base64) via native
 * `crypto.subtle`.
 */

import { exportJWK, exportPKCS8, generateKeyPair } from 'jose';
import { md5 } from 'js-md5';
import {
  base64ToBytes,
  bitLength,
  bytesToBase64,
  concat,
  createReader,
  hasMore,
  mpint,
  readMpint,
  readString,
  readText,
  sshString,
  sshStringFromText,
} from "./ssh-wire-format.js";

export type SshKeyFamily = 'rsa' | 'ec' | 'ed25519';
export type SshRsaModulusLength = 2048 | 3072 | 4096;
export type SshEcCurve = 'P-256' | 'P-384' | 'P-521';

export const SSH_RSA_MODULUS_LENGTHS: readonly SshRsaModulusLength[] = [2048, 3072, 4096];
export const SSH_EC_CURVES: readonly SshEcCurve[] = ['P-256', 'P-384', 'P-521'];

const EC_CURVE_NAMES: Record<SshEcCurve, string> = { 'P-256': 'nistp256', 'P-384': 'nistp384', 'P-521': 'nistp521' };
const EC_JOSE_ALG: Record<SshEcCurve, string> = { 'P-256': 'ES256', 'P-384': 'ES384', 'P-521': 'ES512' };

function base64urlToBytes(b64url: string): Uint8Array {
  const padded = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64url.length / 4) * 4, '=');
  return base64ToBytes(padded);
}

export async function sha256Fingerprint(blob: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await hostCrypto().subtle.digest('SHA-256', blob as BufferSource));
  return `SHA256:${bytesToBase64(digest).replace(/=+$/, '')}`;
}

export function md5Fingerprint(blob: Uint8Array): string {
  const hex: string = md5(blob);
  return hex.match(/.{2}/g)!.join(':');
}

export interface GenerateSshKeyPairRequest {
  readonly family: SshKeyFamily;
  readonly modulusLength?: SshRsaModulusLength;
  readonly curve?: SshEcCurve;
  readonly comment?: string;
}

export interface GeneratedSshKeyPair {
  readonly publicKeyLine: string;
  readonly privateKeyPem: string;
  readonly fingerprintSha256: string;
  readonly fingerprintMd5: string;
}

export async function generateSshKeyPair(request: GenerateSshKeyPairRequest): Promise<GeneratedSshKeyPair> {
  let alg: string;
  let modulusLength: number | undefined;
  if (request.family === 'rsa') {
    modulusLength = request.modulusLength ?? 2048;
    alg = 'RS256';
  } else if (request.family === 'ec') {
    alg = EC_JOSE_ALG[request.curve ?? 'P-256'];
  } else {
    alg = 'Ed25519';
  }

  const { publicKey, privateKey } = await generateKeyPair(alg, { extractable: true, modulusLength });
  const jwk = await exportJWK(publicKey);
  const privateKeyPem = await exportPKCS8(privateKey);

  let blob: Uint8Array;
  let typeLabel: string;
  if (request.family === 'rsa') {
    blob = encodeRsaPublicKeyBlob(base64urlToBytes(jwk.e!), base64urlToBytes(jwk.n!));
    typeLabel = 'ssh-rsa';
  } else if (request.family === 'ec') {
    const curve = request.curve ?? 'P-256';
    blob = encodeEcdsaPublicKeyBlob(curve, base64urlToBytes(jwk.x!), base64urlToBytes(jwk.y!));
    typeLabel = `ecdsa-sha2-${EC_CURVE_NAMES[curve]}`;
  } else {
    blob = encodeEd25519PublicKeyBlob(base64urlToBytes(jwk.x!));
    typeLabel = 'ssh-ed25519';
  }

  const comment = request.comment?.trim();
  const publicKeyLine = `${typeLabel} ${bytesToBase64(blob)}${comment ? ' ' + comment : ''}`;

  return {
    publicKeyLine,
    privateKeyPem,
    fingerprintSha256: await sha256Fingerprint(blob),
    fingerprintMd5: md5Fingerprint(blob),
  };
}

function encodeRsaPublicKeyBlob(e: Uint8Array, n: Uint8Array): Uint8Array {
  return concat(sshStringFromText('ssh-rsa'), mpint(e), mpint(n));
}

function encodeEcdsaPublicKeyBlob(curve: SshEcCurve, x: Uint8Array, y: Uint8Array): Uint8Array {
  const curveName = EC_CURVE_NAMES[curve];
  const point = concat(new Uint8Array([0x04]), x, y);
  return concat(sshStringFromText(`ecdsa-sha2-${curveName}`), sshStringFromText(curveName), sshString(point));
}

function encodeEd25519PublicKeyBlob(publicKeyBytes: Uint8Array): Uint8Array {
  return concat(sshStringFromText('ssh-ed25519'), sshString(publicKeyBytes));
}

export interface ParsedSshPublicKey {
  readonly type: string;
  readonly comment: string;
  readonly blob: Uint8Array;
  readonly details: ReadonlyArray<{ readonly label: string; readonly value: string }>;
}

export type ParseSshPublicKeyResult = { readonly ok: true; readonly key: ParsedSshPublicKey } | { readonly ok: false; readonly error: string };

const SUPPORTED_BLOB_TYPES = new Set(['ssh-rsa', 'ssh-ed25519', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521']);

export function parseSshPublicKey(line: string): ParseSshPublicKeyResult {
  const trimmed = line.trim();
  if (trimmed === '') return { ok: false, error: 'Enter an SSH public key line.' };

  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return { ok: false, error: 'Expected "<type> <base64> [comment]".' };
  const [declaredType, base64, ...commentParts] = parts;

  let blob: Uint8Array;
  try {
    blob = base64ToBytes(base64);
  } catch {
    return { ok: false, error: 'The key body is not valid Base64.' };
  }

  let blobType: string;
  const reader = createReader(blob);
  try {
    blobType = readText(reader);
  } catch {
    return { ok: false, error: 'Malformed key blob (could not read the key type).' };
  }
  if (blobType !== declaredType) {
    return { ok: false, error: `Declared type "${declaredType}" does not match the blob's internal type "${blobType}".` };
  }
  if (!SUPPORTED_BLOB_TYPES.has(blobType)) {
    return { ok: false, error: `Unsupported key type "${blobType}".` };
  }

  const details: { label: string; value: string }[] = [];
  try {
    if (blobType === 'ssh-rsa') {
      const e = readMpint(reader);
      const n = readMpint(reader);
      details.push({ label: 'Exponent (e) bits', value: String(bitLength(e)) });
      details.push({ label: 'Modulus (n) bits', value: String(bitLength(n)) });
    } else if (blobType === 'ssh-ed25519') {
      const publicKeyBytes = readString(reader);
      details.push({ label: 'Public key length', value: `${publicKeyBytes.length} bytes` });
    } else {
      const curveName = readText(reader);
      const point = readString(reader);
      details.push({ label: 'Curve', value: curveName });
      details.push({ label: 'Point length', value: `${point.length} bytes` });
    }
    if (hasMore(reader)) details.push({ label: 'Warning', value: 'Extra trailing bytes after the expected fields.' });
  } catch {
    return { ok: false, error: 'Malformed key blob (truncated or corrupt).' };
  }

  return { ok: true, key: { type: blobType, comment: commentParts.join(' '), blob, details } };
}
