/**
 * Pure, framework-free JSONPath/JMESPath evaluation used by the
 * JSONPath / JMESPath Tester tool. Shared as-is between the main thread
 * (small inputs) and `json-query-eval.worker.ts` (large inputs).
 */

import { JSONPath } from 'jsonpath-plus';
import * as jmespath from 'jmespath';

export type QueryLanguage = 'jsonpath' | 'jmespath';

export interface QueryError {
  readonly message: string;
}

export type QueryResult = { readonly ok: true; readonly output: string } | { readonly ok: false; readonly error: QueryError };

export function evaluateQuery(jsonInput: string, query: string, language: QueryLanguage): QueryResult {
  if (jsonInput.trim() === '') return { ok: false, error: { message: 'Enter some JSON.' } };
  if (query.trim() === '') {
    return { ok: false, error: { message: `Enter a ${language === 'jsonpath' ? 'JSONPath' : 'JMESPath'} query.` } };
  }

  let data: null | boolean | number | string | object | unknown[];
  try {
    data = JSON.parse(jsonInput);
  } catch (error) {
    return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } };
  }

  try {
    const matched = language === 'jsonpath' ? JSONPath({ path: query, json: data }) : jmespath.search(data, query);
    return { ok: true, output: JSON.stringify(matched, null, 2) ?? 'undefined' };
  } catch (error) {
    return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } };
  }
}
