/**
 * Pure, framework-free YAML <-> JSON conversion used by the YAML <-> JSON
 * Converter tool. Shared as-is between the main thread (small inputs) and
 * `yaml-convert.worker.ts` (large inputs).
 */

import { dump, load, YAMLException } from 'js-yaml';

export type YamlDirection = 'yaml-to-json' | 'json-to-yaml';
export type JsonIndent = 2 | 4 | 'tab';

export interface YamlConvertError {
  readonly message: string;
}

export type YamlConvertResult =
  | { readonly ok: true; readonly output: string }
  | { readonly ok: false; readonly error: YamlConvertError };

function indentString(indent: JsonIndent): string {
  return indent === 'tab' ? '\t' : ' '.repeat(indent);
}

export function convertYaml(input: string, direction: YamlDirection, jsonIndent: JsonIndent): YamlConvertResult {
  if (input.trim() === '') {
    return { ok: false, error: { message: direction === 'yaml-to-json' ? 'Enter some YAML.' : 'Enter some JSON.' } };
  }

  try {
    if (direction === 'yaml-to-json') {
      const parsed: unknown = load(input);
      return { ok: true, output: JSON.stringify(parsed, null, indentString(jsonIndent)) };
    }

    const parsed: unknown = JSON.parse(input);
    return { ok: true, output: dump(parsed, { indent: 2 }) };
  } catch (error) {
    if (error instanceof YAMLException) return { ok: false, error: { message: error.message } };
    if (error instanceof Error) return { ok: false, error: { message: error.message } };
    return { ok: false, error: { message: String(error) } };
  }
}
