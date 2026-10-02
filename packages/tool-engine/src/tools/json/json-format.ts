/**
 * Pure, framework-free JSON validate/format/minify used by the JSON
 * Formatter tool. Shared as-is between the main thread (small inputs) and
 * `json-format.worker.ts` (large inputs), since it only touches JSON/string
 * APIs with no DOM or webworker-specific globals.
 */

export type JsonIndent = 2 | 4 | 'tab';
export type JsonMode = 'pretty' | 'minify' | 'validate';

export interface JsonParseError {
  readonly message: string;
  readonly line?: number;
  readonly column?: number;
}

export type JsonFormatResult = { readonly ok: true; readonly output: string } | { readonly ok: false; readonly error: JsonParseError };

export function indentString(indent: JsonIndent): string {
  return indent === 'tab' ? '\t' : ' '.repeat(indent);
}

/**
 * `JSON.parse` error messages are not standardized across engines (and
 * modern V8 dropped the numeric position it used to report), so this is
 * necessarily best-effort: it recognizes the two formats engines are known
 * to use ("...line L column C..." and "...position N...") and otherwise
 * just surfaces the raw message, which is still informative on its own.
 */
function locateError(input: string, error: unknown): JsonParseError {
  const message = error instanceof Error ? error.message : String(error);

  const lineColumnMatch = message.match(/line (\d+) column (\d+)/i);
  if (lineColumnMatch) return { message, line: Number(lineColumnMatch[1]), column: Number(lineColumnMatch[2]) };

  const positionMatch = message.match(/position (\d+)/i);
  if (positionMatch) {
    const position = Number(positionMatch[1]);
    const before = input.slice(0, position);
    return { message, line: before.split('\n').length, column: position - before.lastIndexOf('\n') };
  }

  return { message };
}

export function processJson(input: string, mode: JsonMode, indent: JsonIndent): JsonFormatResult {
  if (input.trim() === '') return { ok: false, error: { message: 'Enter some JSON.' } };

  try {
    const parsed: unknown = JSON.parse(input);

    if (mode === 'minify') return { ok: true, output: JSON.stringify(parsed) };
    if (mode === 'validate') return { ok: true, output: input };
    return { ok: true, output: JSON.stringify(parsed, null, indentString(indent)) };
  } catch (error) {
    return { ok: false, error: locateError(input, error) };
  }
}
