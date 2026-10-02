/**
 * Pure, framework-free JSON Patch (RFC 6902) application used by the JSON
 * Patch Tester tool. Shared as-is between the main thread (small inputs) and
 * `json-patch-test.worker.ts` (large inputs).
 */

import type { Operation } from 'fast-json-patch';
import esm_fast_json_patch from 'fast-json-patch';
const { applyPatch } = esm_fast_json_patch;


export interface JsonPatchTestError {
  readonly message: string;
}

export type JsonPatchTestResult =
  | { readonly ok: true; readonly output: string }
  | { readonly ok: false; readonly error: JsonPatchTestError };

function parseJson(label: string, input: string): { ok: true; value: unknown } | { ok: false; error: JsonPatchTestError } {
  if (input.trim() === '') return { ok: false, error: { message: `Enter the ${label}.` } };
  try {
    return { ok: true, value: JSON.parse(input) };
  } catch (error) {
    return { ok: false, error: { message: `${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}` } };
  }
}

export function testJsonPatch(documentInput: string, patchInput: string): JsonPatchTestResult {
  const document = parseJson('document', documentInput);
  if (!document.ok) return { ok: false, error: document.error };

  const patch = parseJson('patch', patchInput);
  if (!patch.ok) return { ok: false, error: patch.error };

  if (!Array.isArray(patch.value)) {
    return { ok: false, error: { message: 'patch must be a JSON array of operations.' } };
  }

  try {
    const result = applyPatch(document.value, patch.value as Operation[], true, false);
    return { ok: true, output: JSON.stringify(result.newDocument, null, 2) };
  } catch (error) {
    return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } };
  }
}
