/**
 * Pure, framework-free XML validate/format/minify used by the XML Formatter
 * / Validator-lite tool. Shared as-is between the main thread (small inputs)
 * and `xml-format.worker.ts` (large inputs).
 */

import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser';

export type XmlMode = 'format' | 'minify' | 'validate';
export type XmlIndent = 2 | 4 | 'tab';

export interface XmlFormatError {
  readonly message: string;
  readonly line?: number;
  readonly column?: number;
}

export type XmlFormatResult = { readonly ok: true; readonly output: string } | { readonly ok: false; readonly error: XmlFormatError };

const PARSER_OPTIONS = { preserveOrder: true, ignoreAttributes: false, trimValues: true } as const;

function indentString(indent: XmlIndent): string {
  return indent === 'tab' ? '\t' : ' '.repeat(indent);
}

export function processXml(input: string, mode: XmlMode, indent: XmlIndent): XmlFormatResult {
  if (input.trim() === '') return { ok: false, error: { message: 'Enter some XML.' } };

  const validation = XMLValidator.validate(input);
  if (validation !== true) {
    return { ok: false, error: { message: validation.err.msg, line: validation.err.line, column: validation.err.col } };
  }

  if (mode === 'validate') return { ok: true, output: input };

  try {
    const parsed: unknown = new XMLParser(PARSER_OPTIONS).parse(input);
    const builder = new XMLBuilder({ ...PARSER_OPTIONS, format: mode === 'format', indentBy: indentString(indent) });
    // `XMLBuilder` unconditionally prefixes formatted output with a newline
    // (a documented quirk, not tied to the input) — trim it off.
    return { ok: true, output: (builder.build(parsed) as string).trim() };
  } catch (error) {
    return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } };
  }
}
