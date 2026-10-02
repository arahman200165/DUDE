/**
 * Pure, framework-free config-file diffing across `.env`, INI, and Java
 * `.properties` formats — reuses each format's existing parser (the .env
 * Editor's `envToObject`, the INI Formatter's `convertIni`, the Properties
 * File Parser's `convertProperties`) and Advanced Diff's `diffTrees()`,
 * rather than a fourth from-scratch parser.
 */
import { diffTrees, type TreeDiffResult } from "../advanced-diff/object-tree-diff.js";
import { envToObject } from "../env-editor/env-format.js";
import { convertIni } from "../ini-formatter/ini-convert.js";
import { convertProperties } from "../properties-parser/properties-convert.js";

export type ConfigFormat = 'env' | 'ini' | 'properties';

export type ParseConfigResult = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: string };

export function parseConfig(text: string, format: ConfigFormat): ParseConfigResult {
  if (format === 'env') return { ok: true, value: envToObject(text) };

  if (format === 'ini') {
    const result = convertIni(text, 'ini-to-json');
    return result.ok ? { ok: true, value: JSON.parse(result.output) } : { ok: false, error: result.error.message };
  }

  const result = convertProperties(text, 'properties-to-json');
  return result.ok ? { ok: true, value: JSON.parse(result.output) } : { ok: false, error: result.error.message };
}

export type ConfigDiffResult = { readonly ok: true; readonly diff: TreeDiffResult } | { readonly ok: false; readonly error: string };

export function diffConfigFiles(before: string, after: string, format: ConfigFormat): ConfigDiffResult {
  const beforeParsed = parseConfig(before, format);
  if (!beforeParsed.ok) return { ok: false, error: `Before: ${beforeParsed.error}` };

  const afterParsed = parseConfig(after, format);
  if (!afterParsed.ok) return { ok: false, error: `After: ${afterParsed.error}` };

  return { ok: true, diff: diffTrees(beforeParsed.value, afterParsed.value, { ignoreCase: false }) };
}
