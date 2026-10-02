/** Pure, framework-free `.env` <-> JSON conversion, reusing the .env Editor's parse/serialize functions. */
import { parseEnv, serializeEnv } from "../env-editor/env-format.js";

export type EnvJsonDirection = 'env-to-json' | 'json-to-env';

export type EnvJsonConvertResult = { readonly ok: true; readonly output: string } | { readonly ok: false; readonly error: string };

export function convertEnvJson(input: string, direction: EnvJsonDirection): EnvJsonConvertResult {
  if (input.trim() === '') {
    return { ok: false, error: direction === 'env-to-json' ? 'Enter some .env text.' : 'Enter a JSON object.' };
  }

  if (direction === 'env-to-json') {
    const obj = Object.fromEntries(parseEnv(input).map((pair) => [pair.key, pair.value]));
    return { ok: true, output: JSON.stringify(obj, null, 2) };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    return { ok: false, error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'JSON input must be a flat object.' };
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  if (!entries.every(([, value]) => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')) {
    return { ok: false, error: 'Every value must be a string, number, or boolean.' };
  }

  return { ok: true, output: serializeEnv(entries.map(([key, value]) => ({ key, value: String(value) }))) };
}
