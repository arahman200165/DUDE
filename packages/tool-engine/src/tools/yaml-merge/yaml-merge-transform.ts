/**
 * Pure, framework-free YAML merge used by the YAML Merge tool. Shared as-is
 * between the main thread (small inputs) and `yaml-merge.worker.ts` (large
 * inputs).
 */

import { dump, load, YAMLException } from 'js-yaml';

export interface YamlMergeError {
  readonly message: string;
}

export type YamlMergeResult = { readonly ok: true; readonly output: string } | { readonly ok: false; readonly error: YamlMergeError };

type YamlValue = null | boolean | number | string | YamlValue[] | { [key: string]: YamlValue };

function isPlainObject(value: unknown): value is { [key: string]: YamlValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Recursive merge: overlay keys win, nested objects merge, arrays/scalars are replaced wholesale. */
function deepMerge(base: YamlValue, overlay: YamlValue): YamlValue {
  if (isPlainObject(base) && isPlainObject(overlay)) {
    const result: { [key: string]: YamlValue } = { ...base };
    for (const [key, value] of Object.entries(overlay)) {
      result[key] = key in base ? deepMerge(base[key], value) : value;
    }
    return result;
  }
  return overlay;
}

function parseYaml(label: string, input: string): { ok: true; value: YamlValue } | { ok: false; error: YamlMergeError } {
  if (input.trim() === '') return { ok: false, error: { message: `Enter the ${label} YAML document.` } };
  try {
    return { ok: true, value: load(input) as YamlValue };
  } catch (error) {
    const detail = error instanceof YAMLException ? error.message : error instanceof Error ? error.message : String(error);
    return { ok: false, error: { message: `${label} YAML is invalid: ${detail}` } };
  }
}

export function mergeYaml(baseInput: string, overlayInput: string): YamlMergeResult {
  const base = parseYaml('base', baseInput);
  if (!base.ok) return { ok: false, error: base.error };

  const overlay = parseYaml('overlay', overlayInput);
  if (!overlay.ok) return { ok: false, error: overlay.error };

  try {
    const merged = deepMerge(base.value, overlay.value);
    return { ok: true, output: dump(merged, { indent: 2 }) };
  } catch (error) {
    return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } };
  }
}
