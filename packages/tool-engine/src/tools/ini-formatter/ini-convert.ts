/**
 * Pure, framework-free INI <-> JSON conversion used by the INI Formatter /
 * Parser tool. Shared as-is between the main thread (small inputs) and
 * `ini-convert.worker.ts` (large inputs).
 *
 * Note: the `ini` format has no formal grammar, so `ini.parse` never throws
 * — a line with no "key=value" shape is simply parsed as a boolean-true key.
 * The only realistic parse-error path here is on the JSON side.
 */

import { parse, stringify } from 'ini';

export type IniDirection = 'ini-to-json' | 'json-to-ini';

export interface IniConvertError {
  readonly message: string;
}

export type IniConvertResult = { readonly ok: true; readonly output: string } | { readonly ok: false; readonly error: IniConvertError };

export function convertIni(input: string, direction: IniDirection): IniConvertResult {
  if (input.trim() === '') {
    return { ok: false, error: { message: direction === 'ini-to-json' ? 'Enter some INI.' : 'Enter some JSON.' } };
  }

  try {
    if (direction === 'ini-to-json') {
      const parsed: unknown = parse(input);
      return { ok: true, output: JSON.stringify(parsed, null, 2) };
    }

    const parsed: unknown = JSON.parse(input);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ok: false, error: { message: 'Top-level JSON must be an object to convert to INI.' } };
    }
    // `ini.stringify` always emits CRLF line endings; normalize to LF for consistency with every other tool's output.
    return { ok: true, output: stringify(parsed as Record<string, unknown>).replace(/\r\n/g, '\n') };
  } catch (error) {
    return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } };
  }
}
