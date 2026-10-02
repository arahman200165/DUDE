/**
 * Pure, framework-free any-format-to-any-format conversion used by the
 * Universal Structured Data Converter tool: parses the source format into a
 * canonical JS value, then stringifies that value into the target format.
 *
 * Deliberately self-contained rather than importing sibling tools' logic:
 * the existing TOML Formatter and XML Formatter tools don't do JSON
 * conversion (TOML Formatter only reformats TOML; XML Formatter only
 * formats/minifies/validates XML), and YAML \<-> JSON Converter's
 * `convertYaml` is direction-keyed rather than a clean parse/stringify
 * pair — none of them are a natural fit to import as-is. This file calls
 * the same underlying libraries those tools use (`js-yaml`, `fast-xml-parser`,
 * `papaparse`, `smol-toml`) directly instead, at the cost of a few
 * genuinely thin wrapper calls rather than owning any real parsing logic.
 */

import { dump, load } from 'js-yaml';
import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser';
import Papa from 'papaparse';
import { parse as tomlParse, stringify as tomlStringify } from 'smol-toml';

export type StructuredFormat = 'json' | 'yaml' | 'xml' | 'toml' | 'csv';

export interface ConvertError {
  readonly message: string;
}

export type ConvertResult = { readonly ok: true; readonly output: string } | { readonly ok: false; readonly error: ConvertError };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseCsv(input: string): unknown {
  const parsed = Papa.parse<Record<string, string>>(input, { header: true, skipEmptyLines: true });
  // A single-column CSV has no delimiter to detect; Papa still parses it correctly and just warns.
  const fatalErrors = parsed.errors.filter((error) => error.code !== 'UndetectableDelimiter');
  if (fatalErrors.length > 0) throw new Error(fatalErrors[0].message);
  return parsed.data;
}

function stringifyCsv(value: unknown): string {
  if (!Array.isArray(value)) {
    throw new Error('Converting to CSV requires an array of rows/objects at the top level.');
  }
  return Papa.unparse(value, { newline: '\n' });
}

function parseXml(input: string): unknown {
  const validation = XMLValidator.validate(input);
  if (validation !== true) throw new Error(validation.err.msg);
  return new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' }).parse(input);
}

function stringifyXml(value: unknown): string {
  const wrapped =
    isPlainObject(value) && Object.keys(value).length === 1 && isPlainObject(Object.values(value)[0])
      ? value
      : { root: value };

  const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_', format: true, indentBy: '  ' });
  return (builder.build(wrapped) as string).trim();
}

function stringifyToml(value: unknown): string {
  const table = isPlainObject(value) ? value : { items: value };
  return tomlStringify(table as Record<string, unknown>);
}

function parseStructured(format: StructuredFormat, input: string): unknown {
  switch (format) {
    case 'json':
      return JSON.parse(input);
    case 'yaml':
      return load(input);
    case 'toml':
      return tomlParse(input);
    case 'xml':
      return parseXml(input);
    case 'csv':
      return parseCsv(input);
  }
}

function stringifyStructured(format: StructuredFormat, value: unknown): string {
  switch (format) {
    case 'json':
      return JSON.stringify(value, null, 2);
    case 'yaml':
      return dump(value, { indent: 2 });
    case 'toml':
      return stringifyToml(value);
    case 'xml':
      return stringifyXml(value);
    case 'csv':
      return stringifyCsv(value);
  }
}

const FORMAT_LABEL: Record<StructuredFormat, string> = { json: 'JSON', yaml: 'YAML', xml: 'XML', toml: 'TOML', csv: 'CSV' };

export function convertStructuredData(input: string, fromFormat: StructuredFormat, toFormat: StructuredFormat): ConvertResult {
  if (input.trim() === '') return { ok: false, error: { message: `Enter some ${FORMAT_LABEL[fromFormat]}.` } };

  let value: unknown;
  try {
    value = parseStructured(fromFormat, input);
  } catch (error) {
    return { ok: false, error: { message: `Could not parse ${FORMAT_LABEL[fromFormat]}: ${error instanceof Error ? error.message : String(error)}` } };
  }

  try {
    return { ok: true, output: stringifyStructured(toFormat, value) };
  } catch (error) {
    return {
      ok: false,
      error: { message: `Could not produce ${FORMAT_LABEL[toFormat]}: ${error instanceof Error ? error.message : String(error)}` },
    };
  }
}
