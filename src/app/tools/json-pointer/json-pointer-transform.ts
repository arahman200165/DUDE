/**
 * Pure, framework-free RFC 6901 JSON Pointer resolution used by the JSON
 * Pointer Tester tool. Shared as-is between the main thread (small inputs)
 * and `json-pointer.worker.ts` (large inputs).
 */

export interface JsonPointerError {
  readonly message: string;
}

export type JsonPointerResult = { readonly ok: true; readonly output: string } | { readonly ok: false; readonly error: JsonPointerError };

function unescapeToken(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

const ARRAY_INDEX = /^(0|[1-9]\d*)$/;

export function resolveJsonPointer(jsonInput: string, pointer: string): JsonPointerResult {
  if (jsonInput.trim() === '') return { ok: false, error: { message: 'Enter some JSON.' } };
  // RFC 6901 section 5 defines the empty pointer as the whole document.
  if (pointer !== '' && !pointer.startsWith('/')) return { ok: false, error: { message: 'A JSON Pointer must start with "/".' } };

  let data: unknown;
  try {
    data = JSON.parse(jsonInput);
  } catch (error) {
    return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } };
  }

  const tokens = pointer.split('/').slice(1).map(unescapeToken);
  let current: unknown = data;

  for (const token of tokens) {
    if (Array.isArray(current)) {
      if (token === '-') return { ok: false, error: { message: 'The "-" token refers to a nonexistent array element.' } };
      if (!ARRAY_INDEX.test(token)) return { ok: false, error: { message: `Invalid array index "${token}".` } };
      const index = Number(token);
      if (index >= current.length) return { ok: false, error: { message: `Array index ${index} is out of bounds.` } };
      current = current[index];
    } else if (current !== null && typeof current === 'object') {
      if (!Object.prototype.hasOwnProperty.call(current, token)) {
        return { ok: false, error: { message: `No property "${token}" at this path.` } };
      }
      current = (current as Record<string, unknown>)[token];
    } else {
      return { ok: false, error: { message: `Cannot resolve "${token}" — not an object or array at this path.` } };
    }
  }

  return { ok: true, output: JSON.stringify(current, null, 2) ?? 'undefined' };
}
