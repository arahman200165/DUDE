import { jsonrepair } from 'jsonrepair';

export type JsonRepairResult = { readonly ok: true; readonly repaired: string } | { readonly ok: false; readonly error: string };

/**
 * Thin wrapper over `jsonrepair` — trailing-comma/unquoted-key/single-quote/
 * comment repair has real edge cases (commas or comments inside string
 * literals, nested-quote escaping) that warrant a purpose-built library
 * rather than a hand-rolled repair pass.
 */
export function repairJson(input: string): JsonRepairResult {
  try {
    return { ok: true, repaired: jsonrepair(input) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not repair this input.' };
  }
}
