/**
 * Pure, framework-free JWKS-to-PEM conversion used by the JWKS → Public Keys
 * tool. Parses a JWKS document's "keys" array and exports each key as a
 * SPKI PEM public key, alongside its raw JWK, for use outside the browser.
 */

import { exportSPKI, importJWK } from 'jose';

export interface JwksKeyEntry {
  readonly raw: Record<string, unknown>;
  readonly kty?: string;
  readonly alg?: string;
  readonly kid?: string;
}

export type JwksKeysResult =
  | { readonly ok: true; readonly keys: readonly JwksKeyEntry[] }
  | { readonly ok: false; readonly error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, field: string): string | undefined {
  return typeof record[field] === 'string' ? (record[field] as string) : undefined;
}

export function parseJwksKeys(text: string): JwksKeysResult {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, error: 'Paste a JWKS document.' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: 'Not valid JSON.' };
  }

  if (!isRecord(parsed) || !Array.isArray(parsed['keys'])) {
    return { ok: false, error: 'A JWKS document must be a JSON object with a "keys" array.' };
  }

  const rawKeys = parsed['keys'] as unknown[];
  if (rawKeys.length === 0) return { ok: false, error: 'The "keys" array is empty.' };

  const keys = rawKeys.map((raw): JwksKeyEntry => {
    if (!isRecord(raw)) return { raw: {} };
    return { raw, kty: stringField(raw, 'kty'), alg: stringField(raw, 'alg'), kid: stringField(raw, 'kid') };
  });

  return { ok: true, keys };
}

export type PemConversionResult =
  | { readonly ok: true; readonly pem: string }
  | { readonly ok: false; readonly error: string };

export async function convertJwkToPem(jwk: Record<string, unknown>, alg?: string): Promise<PemConversionResult> {
  try {
    const key = await importJWK(jwk as JsonWebKey, alg);
    if (key instanceof Uint8Array) {
      return { ok: false, error: 'This is a symmetric key — there is no public PEM form to export.' };
    }
    const pem = await exportSPKI(key as Parameters<typeof exportSPKI>[0]);
    return { ok: true, pem };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not convert this key to PEM.' };
  }
}

export async function convertAllToPem(
  keys: readonly JwksKeyEntry[],
): Promise<readonly (JwksKeyEntry & PemConversionResult)[]> {
  return Promise.all(
    keys.map(async (key) => ({ ...key, ...(await convertJwkToPem(key.raw, key.alg)) })),
  );
}
