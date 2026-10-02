/**
 * Pure, framework-free JSON flatten/unflatten used by the JSON Flatten /
 * Unflatten tool. Shared as-is between the main thread (small inputs) and
 * `json-flatten.worker.ts` (large inputs).
 */

export type FlattenDirection = 'flatten' | 'unflatten';

export interface FlattenError {
  readonly message: string;
}

export type FlattenResult = { readonly ok: true; readonly output: string } | { readonly ok: false; readonly error: FlattenError };

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function flattenValue(value: JsonValue, prefix: string, out: JsonObject): void {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      out[prefix] = value;
      return;
    }
    value.forEach((item, index) => flattenValue(item, `${prefix}[${index}]`, out));
    return;
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) {
      out[prefix] = value;
      return;
    }
    for (const key of keys) {
      flattenValue(value[key], prefix === '' ? key : `${prefix}.${key}`, out);
    }
    return;
  }

  out[prefix] = value;
}

function flatten(value: JsonObject | JsonValue[]): JsonObject {
  const out: JsonObject = {};
  flattenValue(value, '', out);
  return out;
}

function parsePath(path: string): (string | number)[] {
  const matches = path.match(/[^.[\]]+|\[\d+\]/g) ?? [];
  return matches.map((match) => (match.startsWith('[') ? Number(match.slice(1, -1)) : match));
}

function unflatten(flat: JsonObject): JsonValue {
  const root: JsonObject = {};
  for (const [path, value] of Object.entries(flat)) {
    const segments = parsePath(path);
    if (segments.length === 0) continue;

    let cursor: JsonObject | JsonValue[] = root;
    segments.forEach((segment, index) => {
      const isLast = index === segments.length - 1;
      const key = segment as never;
      if (isLast) {
        (cursor as Record<string | number, JsonValue>)[key] = value;
        return;
      }
      const nextSegment = segments[index + 1];
      const container = cursor as Record<string | number, JsonValue>;
      if (container[key] === undefined) {
        container[key] = typeof nextSegment === 'number' ? [] : {};
      }
      cursor = container[key] as JsonObject | JsonValue[];
    });
  }
  return root;
}

export function flattenJson(input: string, direction: FlattenDirection): FlattenResult {
  if (input.trim() === '') return { ok: false, error: { message: 'Enter some JSON.' } };

  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } };
  }

  try {
    if (direction === 'flatten') {
      if (!isPlainObject(parsed) && !Array.isArray(parsed)) {
        return { ok: false, error: { message: 'Top-level JSON must be an object or array to flatten.' } };
      }
      return { ok: true, output: JSON.stringify(flatten(parsed as JsonObject | JsonValue[]), null, 2) };
    }

    if (!isPlainObject(parsed)) {
      return { ok: false, error: { message: 'Top-level JSON must be a flat object of path keys to unflatten.' } };
    }
    return { ok: true, output: JSON.stringify(unflatten(parsed), null, 2) };
  } catch (error) {
    return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } };
  }
}
