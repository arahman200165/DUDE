import type { JsonFormatResult, JsonIndent, JsonMode } from '@dude/tool-engine/tools/json/json-format';

export const MAX_INPUT_BYTES = 2 * 1024 * 1024;
export const INPUT_TOO_LARGE = 'Input is larger than 2 MiB. Android formats up to 2 MiB of JSON at a time.';

export const JSON_MODES: readonly { readonly id: JsonMode; readonly label: string }[] = [
  { id: 'pretty', label: 'Pretty' }, { id: 'minify', label: 'Minify' }, { id: 'validate', label: 'Validate' },
];
export const INDENT_PREFIX = 'indent-';
export const INDENTS: readonly { readonly id: string; readonly value: JsonIndent; readonly label: string }[] = [
  { id: '2', value: 2, label: '2 spaces' }, { id: '4', value: 4, label: '4 spaces' }, { id: 'tab', value: 'tab', label: 'Tab' },
];
export const SAMPLE_JSON = '{"a":1,"b":[2,3]}';

export const decodeMode = (raw: unknown): JsonMode | null => JSON_MODES.find(mode => mode.id === raw)?.id ?? null;
/** The web tool stores the indent as 2, 4 or 'tab'; a numeric string is tolerated. */
export function decodeIndent(raw: unknown): JsonIndent | null {
  if (raw === 2 || raw === 4 || raw === 'tab') return raw;
  if (raw === '2') return 2;
  if (raw === '4') return 4;
  return null;
}
export const indentId = (indent: JsonIndent): string => String(indent);

export type JsonOutcome =
  | { readonly ok: true; readonly output: string }
  | { readonly ok: false; readonly error: string };

/** The engine error with its line/column when the engine could locate it (it returns them separately from the message). */
export function describeJsonError(error: { readonly message: string; readonly line?: number; readonly column?: number }): string {
  if (error.line === undefined || error.column === undefined || /line \d+ column \d+/i.test(error.message)) return error.message;
  return `${error.message} (line ${error.line}, column ${error.column})`;
}

export function toOutcome(result: JsonFormatResult): JsonOutcome {
  return result.ok ? result : { ok: false, error: describeJsonError(result.error) };
}
