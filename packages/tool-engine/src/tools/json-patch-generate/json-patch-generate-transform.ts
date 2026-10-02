/**
 * Pure, framework-free JSON Patch (RFC 6902) generation used by the JSON
 * Patch Generator tool. Shared as-is between the main thread (small inputs)
 * and `json-patch-generate.worker.ts` (large inputs).
 */

import esm_fast_json_patch from 'fast-json-patch';
const { compare } = esm_fast_json_patch;


export interface JsonPatchGenerateError {
  readonly message: string;
}

export type JsonPatchGenerateResult =
  | { readonly ok: true; readonly output: string }
  | { readonly ok: false; readonly error: JsonPatchGenerateError };

function parseJson(label: string, input: string): { ok: true; value: unknown } | { ok: false; error: JsonPatchGenerateError } {
  if (input.trim() === '') return { ok: false, error: { message: `Enter the ${label} JSON document.` } };
  try {
    return { ok: true, value: JSON.parse(input) };
  } catch (error) {
    return { ok: false, error: { message: `${label} JSON is invalid: ${error instanceof Error ? error.message : String(error)}` } };
  }
}

export function generateJsonPatch(beforeInput: string, afterInput: string): JsonPatchGenerateResult {
  const before = parseJson('before', beforeInput);
  if (!before.ok) return { ok: false, error: before.error };

  const after = parseJson('after', afterInput);
  if (!after.ok) return { ok: false, error: after.error };

  try {
    const patch = compare(before.value as object, after.value as object);
    return { ok: true, output: JSON.stringify(patch, null, 2) };
  } catch (error) {
    return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } };
  }
}
