/**
 * Pure, framework-free merging of an ordered list of config sources
 * (.env/INI/.properties/YAML/JSON), later sources overriding earlier ones.
 * Each format is parsed via its existing tool's parser (.env Editor, INI
 * Formatter, Properties File Parser, `js-yaml`, `JSON.parse`) and folded
 * together with JSON Merge's `deepMerge`, rather than a fifth parser plus a
 * new merge algorithm.
 */
import { load as loadYaml } from 'js-yaml';
import { deepMerge, type JsonValue } from "../json-merge/json-merge-transform.js";
import { envToObject } from "../env-editor/env-format.js";
import { convertIni } from "../ini-formatter/ini-convert.js";
import { convertProperties } from "../properties-parser/properties-convert.js";

export type ConfigSourceFormat = 'env' | 'ini' | 'properties' | 'yaml' | 'json';

export interface ConfigSource {
  readonly format: ConfigSourceFormat;
  readonly text: string;
}

type ParseSourceResult = { readonly ok: true; readonly value: JsonValue } | { readonly ok: false; readonly error: string };

function parseSource(source: ConfigSource): ParseSourceResult {
  const text = source.text;
  if (text.trim() === '') return { ok: true, value: {} };

  if (source.format === 'env') return { ok: true, value: envToObject(text) };

  if (source.format === 'yaml') {
    try {
      return { ok: true, value: (loadYaml(text) ?? {}) as JsonValue };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Failed to parse YAML.' };
    }
  }

  if (source.format === 'json') {
    try {
      return { ok: true, value: JSON.parse(text) as JsonValue };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Failed to parse JSON.' };
    }
  }

  if (source.format === 'ini') {
    const result = convertIni(text, 'ini-to-json');
    return result.ok ? { ok: true, value: JSON.parse(result.output) } : { ok: false, error: result.error.message };
  }

  const result = convertProperties(text, 'properties-to-json');
  return result.ok ? { ok: true, value: JSON.parse(result.output) } : { ok: false, error: result.error.message };
}

export type MergeConfigResult = { readonly ok: true; readonly output: string } | { readonly ok: false; readonly error: string };

export function mergeConfigSources(sources: readonly ConfigSource[]): MergeConfigResult {
  if (sources.length === 0) return { ok: false, error: 'Add at least one config source.' };

  let merged: JsonValue = {};
  for (let i = 0; i < sources.length; i++) {
    const parsed = parseSource(sources[i]);
    if (!parsed.ok) return { ok: false, error: `Source ${i + 1} (${sources[i].format}): ${parsed.error}` };
    merged = deepMerge(merged, parsed.value);
  }

  return { ok: true, output: JSON.stringify(merged, null, 2) };
}
