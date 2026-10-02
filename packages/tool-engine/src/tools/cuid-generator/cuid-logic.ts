/**
 * Pure, framework-free CUID2 generation, built on `@paralleldrive/cuid2`
 * (its collision-resistance math — entropy pool + counter + fingerprint hash — is not worth reimplementing).
 */
import { init, isCuid } from '@paralleldrive/cuid2';

export type GenerateResult = { readonly ok: true; readonly values: readonly string[] } | { readonly ok: false; readonly error: string };

export function generateCuids(count: number, length: number): GenerateResult {
  if (!Number.isInteger(count) || count < 1 || count > 1000) {
    return { ok: false, error: 'Count must be an integer between 1 and 1000.' };
  }
  if (!Number.isInteger(length) || length < 2 || length > 32) {
    return { ok: false, error: 'Length must be an integer between 2 and 32.' };
  }

  const createId = init({ length });
  return { ok: true, values: Array.from({ length: count }, () => createId()) };
}

export function isValidCuid(value: string): boolean {
  return isCuid(value.trim());
}
