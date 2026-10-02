/**
 * Pure, framework-free `.env` validation against a required-keys list with
 * lightweight type hints, reusing the .env Editor's `parseEnv`.
 */
import { parseEnv } from "../env-editor/env-format.js";

export type EnvValueType = 'string' | 'number' | 'boolean' | 'url';

export interface EnvRule {
  readonly key: string;
  readonly type: EnvValueType;
  readonly required: boolean;
}

/** One rule per line: `KEY[:type][?]` — a trailing `?` marks it optional; type defaults to "string". */
export function parseEnvRules(rulesText: string): readonly EnvRule[] {
  const rules: EnvRule[] = [];

  for (const rawLine of rulesText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;

    const optional = line.endsWith('?');
    const withoutOptional = optional ? line.slice(0, -1).trim() : line;
    const [key, type] = withoutOptional.split(':').map((part) => part.trim());
    if (!key) continue;

    rules.push({ key, type: (type as EnvValueType) || 'string', required: !optional });
  }

  return rules;
}

export interface EnvValidationIssue {
  readonly key: string;
  readonly message: string;
}

const NUMBER_RE = /^-?\d+(\.\d+)?$/;
const BOOLEAN_RE = /^(true|false)$/i;
const URL_RE = /^[a-z][a-z0-9+.-]*:\/\/\S+$/i;

function isValidType(value: string, type: EnvValueType): boolean {
  if (type === 'number') return NUMBER_RE.test(value);
  if (type === 'boolean') return BOOLEAN_RE.test(value);
  if (type === 'url') return URL_RE.test(value);
  return true;
}

export function validateEnv(envText: string, rulesText: string): readonly EnvValidationIssue[] {
  const values: Record<string, string> = {};
  for (const pair of parseEnv(envText)) values[pair.key] = pair.value;

  const issues: EnvValidationIssue[] = [];
  for (const rule of parseEnvRules(rulesText)) {
    const value = values[rule.key];
    if (value === undefined) {
      if (rule.required) issues.push({ key: rule.key, message: 'Missing required variable.' });
      continue;
    }
    if (!isValidType(value, rule.type)) {
      issues.push({ key: rule.key, message: `Value "${value}" is not a valid ${rule.type}.` });
    }
  }

  return issues;
}
