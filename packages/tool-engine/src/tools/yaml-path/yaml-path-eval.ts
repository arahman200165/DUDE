/**
 * Pure, framework-free JSONPath/JMESPath evaluation against a parsed YAML
 * document, used by the YAML Path Tester tool. Shared as-is between the main
 * thread (small inputs) and `yaml-path-eval.worker.ts` (large inputs).
 */

import { load, YAMLException } from 'js-yaml';
import { JSONPath } from 'jsonpath-plus';
import * as jmespath from 'jmespath';

export type YamlPathLanguage = 'jsonpath' | 'jmespath';

export interface YamlPathError {
  readonly message: string;
}

export type YamlPathResult = { readonly ok: true; readonly output: string } | { readonly ok: false; readonly error: YamlPathError };

export function evaluateYamlPath(yamlInput: string, query: string, language: YamlPathLanguage): YamlPathResult {
  if (yamlInput.trim() === '') return { ok: false, error: { message: 'Enter some YAML.' } };
  if (query.trim() === '') {
    return { ok: false, error: { message: `Enter a ${language === 'jsonpath' ? 'JSONPath' : 'JMESPath'} query.` } };
  }

  let data: unknown;
  try {
    data = load(yamlInput);
  } catch (error) {
    const detail = error instanceof YAMLException ? error.message : error instanceof Error ? error.message : String(error);
    return { ok: false, error: { message: detail } };
  }

  try {
    const matched = language === 'jsonpath' ? JSONPath({ path: query, json: data as object }) : jmespath.search(data, query);
    return { ok: true, output: JSON.stringify(matched, null, 2) ?? 'undefined' };
  } catch (error) {
    return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } };
  }
}
