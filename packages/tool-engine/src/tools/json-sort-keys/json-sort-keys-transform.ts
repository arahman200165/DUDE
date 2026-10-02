/**
 * Pure, framework-free JSON key sorting used by the JSON Sort Keys tool.
 * Shared as-is between the main thread (small inputs) and
 * `json-sort-keys.worker.ts` (large inputs).
 */

export type SortOrder = 'asc' | 'desc';

export interface JsonSortKeysError {
  readonly message: string;
}

export type JsonSortKeysResult =
  | { readonly ok: true; readonly output: string }
  | { readonly ok: false; readonly error: JsonSortKeysError };

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sortedKeys(obj: JsonObject, order: SortOrder): string[] {
  return Object.keys(obj).sort((a, b) => (order === 'asc' ? a.localeCompare(b) : b.localeCompare(a)));
}

function deepSort(value: JsonValue, order: SortOrder): JsonValue {
  if (Array.isArray(value)) return value.map((item) => deepSort(item, order));
  if (isPlainObject(value)) {
    const result: JsonObject = {};
    for (const key of sortedKeys(value, order)) result[key] = deepSort(value[key], order);
    return result;
  }
  return value;
}

function shallowSort(value: JsonValue, order: SortOrder): JsonValue {
  if (!isPlainObject(value)) return value;
  const result: JsonObject = {};
  for (const key of sortedKeys(value, order)) result[key] = value[key];
  return result;
}

export function sortJsonKeys(input: string, recursive: boolean, order: SortOrder): JsonSortKeysResult {
  if (input.trim() === '') return { ok: false, error: { message: 'Enter some JSON.' } };

  let parsed: JsonValue;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } };
  }

  const sorted = recursive ? deepSort(parsed, order) : shallowSort(parsed, order);
  return { ok: true, output: JSON.stringify(sorted, null, 2) };
}
