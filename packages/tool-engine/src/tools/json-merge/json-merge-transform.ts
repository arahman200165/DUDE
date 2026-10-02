/**
 * Pure, framework-free JSON merge used by the JSON Merge tool. Shared as-is
 * between the main thread (small inputs) and `json-merge.worker.ts` (large
 * inputs).
 */

export type JsonMergeStrategy = 'deep' | 'rfc7396';

export interface JsonMergeError {
  readonly message: string;
}

export type JsonMergeResult = { readonly ok: true; readonly output: string } | { readonly ok: false; readonly error: JsonMergeError };

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Recursive merge: overlay keys win, nested objects merge, arrays/scalars are replaced wholesale. Exported for reuse by the Configuration Merge Tool. */
export function deepMerge(base: JsonValue, overlay: JsonValue): JsonValue {
  if (isPlainObject(base) && isPlainObject(overlay)) {
    const result: JsonObject = { ...base };
    for (const [key, value] of Object.entries(overlay)) {
      result[key] = key in base ? deepMerge(base[key], value) : value;
    }
    return result;
  }
  return overlay;
}

/** RFC 7396 JSON Merge Patch: a `null` in the overlay deletes the key from the result. */
function applyMergePatch(target: JsonValue | undefined, patch: JsonValue): JsonValue {
  if (!isPlainObject(patch)) return patch;

  const result: JsonObject = isPlainObject(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete result[key];
    } else {
      result[key] = applyMergePatch(isPlainObject(target) ? target[key] : undefined, value);
    }
  }
  return result;
}

function parseJson(label: string, input: string): { ok: true; value: JsonValue } | { ok: false; error: JsonMergeError } {
  if (input.trim() === '') return { ok: false, error: { message: `Enter ${label} JSON.` } };
  try {
    return { ok: true, value: JSON.parse(input) as JsonValue };
  } catch (error) {
    return { ok: false, error: { message: `${label} JSON is invalid: ${error instanceof Error ? error.message : String(error)}` } };
  }
}

export function mergeJson(baseInput: string, overlayInput: string, strategy: JsonMergeStrategy): JsonMergeResult {
  const base = parseJson('base', baseInput);
  if (!base.ok) return { ok: false, error: base.error };

  const overlay = parseJson('overlay', overlayInput);
  if (!overlay.ok) return { ok: false, error: overlay.error };

  try {
    const merged = strategy === 'rfc7396' ? applyMergePatch(base.value, overlay.value) : deepMerge(base.value, overlay.value);
    return { ok: true, output: JSON.stringify(merged, null, 2) };
  } catch (error) {
    return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } };
  }
}
