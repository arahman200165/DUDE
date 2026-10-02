/**
 * Pure, framework-free YAML validation used by the YAML Linter tool. Shared
 * as-is between the main thread (small inputs) and `yaml-lint.worker.ts`
 * (large inputs).
 */

import { loadAll, YAMLException } from 'js-yaml';

export interface YamlLintError {
  readonly message: string;
  readonly line?: number;
  readonly column?: number;
}

export type YamlLintResult =
  | { readonly ok: true; readonly documentCount: number }
  | { readonly ok: false; readonly error: YamlLintError };

export function lintYaml(input: string): YamlLintResult {
  if (input.trim() === '') return { ok: false, error: { message: 'Enter some YAML.' } };

  try {
    const documents = loadAll(input);
    return { ok: true, documentCount: documents.length };
  } catch (error) {
    if (error instanceof YAMLException) {
      return {
        ok: false,
        error: {
          message: error.reason || error.message,
          line: error.mark ? error.mark.line + 1 : undefined,
          column: error.mark ? error.mark.column + 1 : undefined,
        },
      };
    }
    return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } };
  }
}
