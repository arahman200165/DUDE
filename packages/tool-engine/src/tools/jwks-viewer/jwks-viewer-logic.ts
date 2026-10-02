/**
 * Pure, framework-free JWKS parsing used by the JWKS Viewer tool. Enumerates
 * each key in a JWKS document's "keys" array and flags common problems —
 * never verifies or fetches anything, purely inspects pasted/uploaded text.
 */

import { importJWK } from 'jose';

export interface JwkSummary {
  readonly raw: Record<string, unknown>;
  readonly kty?: string;
  readonly use?: string;
  readonly alg?: string;
  readonly kid?: string;
  readonly importable: boolean;
  readonly warnings: readonly string[];
}

export type JwksParseResult =
  | { readonly ok: true; readonly keys: readonly JwkSummary[] }
  | { readonly ok: false; readonly error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, field: string): string | undefined {
  return typeof record[field] === 'string' ? (record[field] as string) : undefined;
}

async function summarizeKey(raw: unknown, duplicateKids: ReadonlySet<string>): Promise<JwkSummary> {
  if (!isRecord(raw)) {
    return { raw: {}, importable: false, warnings: ['Entry is not a JSON object.'] };
  }

  const kty = stringField(raw, 'kty');
  const use = stringField(raw, 'use');
  const alg = stringField(raw, 'alg');
  const kid = stringField(raw, 'kid');

  const warnings: string[] = [];
  if (!kid) warnings.push('Missing "kid" — clients may be unable to select this key.');
  if (kid && duplicateKids.has(kid)) warnings.push(`Duplicate "kid" ("${kid}") across this JWKS — key selection is ambiguous.`);
  if (kty === 'oct') warnings.push('Symmetric ("oct") key in a JWKS — JWKS documents should only publish public keys.');

  const keyOps = Array.isArray(raw['key_ops']) ? (raw['key_ops'] as unknown[]) : undefined;
  if (use && keyOps) {
    if (use === 'sig' && keyOps.some((op) => op === 'encrypt' || op === 'decrypt')) {
      warnings.push('"use":"sig" but "key_ops" includes encrypt/decrypt.');
    }
    if (use === 'enc' && keyOps.some((op) => op === 'sign' || op === 'verify')) {
      warnings.push('"use":"enc" but "key_ops" includes sign/verify.');
    }
  }

  let importable = false;
  try {
    await importJWK(raw as JsonWebKey, alg);
    importable = true;
  } catch {
    warnings.push('Could not be imported by the browser\'s crypto engine — check the required parameters for its key type.');
  }

  return { raw, kty, use, alg, kid, importable, warnings };
}

export async function parseJwks(text: string): Promise<JwksParseResult> {
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

  const kidCounts = new Map<string, number>();
  for (const raw of rawKeys) {
    if (isRecord(raw)) {
      const kid = stringField(raw, 'kid');
      if (kid) kidCounts.set(kid, (kidCounts.get(kid) ?? 0) + 1);
    }
  }
  const duplicateKids = new Set([...kidCounts.entries()].filter(([, count]) => count > 1).map(([kid]) => kid));

  const keys = await Promise.all(rawKeys.map((raw) => summarizeKey(raw, duplicateKids)));
  return { ok: true, keys };
}
