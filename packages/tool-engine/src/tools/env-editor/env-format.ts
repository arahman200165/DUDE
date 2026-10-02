/**
 * Pure, framework-free `.env` file parse/serialize ï¿½ `KEY=VALUE` lines, an
 * optional `export ` prefix, and single/double-quoted values (double quotes
 * support `\n`/`\t`/`\r`/`\"`/`\\` escapes; single quotes are literal).
 * Comments and blank lines are skipped on parse and not preserved on
 * serialize, since the key/value editor UI has no row for them.
 */
import type { KeyValuePair } from "@dude/shared-types/shared/models/key-value-pair.model";

const LINE_RE = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;

function unquoteValue(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\([nrt"\\])/g, (_, escape: string) => {
      if (escape === 'n') return '\n';
      if (escape === 'r') return '\r';
      if (escape === 't') return '\t';
      return escape;
    });
  }
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseEnv(text: string): readonly KeyValuePair[] {
  const pairs: KeyValuePair[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;

    const match = LINE_RE.exec(line);
    if (!match) continue;
    pairs.push({ key: match[1], value: unquoteValue(match[2]) });
  }

  return pairs;
}

function needsQuoting(value: string): boolean {
  return value === '' || /[\s#'"\\\n\r]/.test(value);
}

function quoteValue(value: string): string {
  if (!needsQuoting(value)) return value;
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
  return `"${escaped}"`;
}

export function serializeEnv(pairs: readonly KeyValuePair[]): string {
  return pairs.map((pair) => `${pair.key}=${quoteValue(pair.value)}`).join('\n');
}

/** Convenience: parses a `.env` document straight into a flat `{KEY: value}` object. */
export function envToObject(text: string): Record<string, string> {
  return Object.fromEntries(parseEnv(text).map((pair) => [pair.key, pair.value]));
}
