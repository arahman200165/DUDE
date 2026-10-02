/**
 * Pure, framework-free XML <-> CSV conversion used by the XML <-> CSV
 * Converter tool. Shared as-is between the main thread (small inputs) and
 * `xml-csv.worker.ts` (large inputs).
 *
 * Convention: the XML root element wraps one repeating "record" element per
 * row (e.g. `<root><record><a>1</a></record>...</root>`). The record
 * element's tag name is auto-detected when the root has exactly one child
 * key, or when exactly one child key holds an array; otherwise it must be
 * named explicitly.
 */

import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser';
import Papa from 'papaparse';

export type XmlCsvDirection = 'xml-to-csv' | 'csv-to-xml';

export interface XmlCsvError {
  readonly message: string;
}

export type XmlCsvResult = { readonly ok: true; readonly output: string } | { readonly ok: false; readonly error: XmlCsvError };

const PARSER_OPTIONS = { ignoreAttributes: false, trimValues: true, parseTagValue: false, parseAttributeValue: false } as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function xmlToCsv(input: string, recordElement: string): XmlCsvResult {
  if (input.trim() === '') return { ok: false, error: { message: 'Enter some XML.' } };

  const validation = XMLValidator.validate(input);
  if (validation !== true) return { ok: false, error: { message: validation.err.msg } };

  const parsed: unknown = new XMLParser(PARSER_OPTIONS).parse(input);
  const rootKeys = isPlainObject(parsed) ? Object.keys(parsed) : [];
  if (rootKeys.length !== 1) return { ok: false, error: { message: 'XML must have a single root element.' } };

  const root = (parsed as Record<string, unknown>)[rootKeys[0]];
  if (!isPlainObject(root)) return { ok: false, error: { message: 'The root element must contain record elements.' } };

  const trimmedRecordElement = recordElement.trim();
  let recordsValue: unknown;

  if (trimmedRecordElement !== '') {
    if (!(trimmedRecordElement in root)) {
      return { ok: false, error: { message: `No "<${trimmedRecordElement}>" element was found under the root.` } };
    }
    recordsValue = root[trimmedRecordElement];
  } else {
    const childKeys = Object.keys(root);
    const arrayKeys = childKeys.filter((key) => Array.isArray(root[key]));
    if (childKeys.length === 1) {
      recordsValue = root[childKeys[0]];
    } else if (arrayKeys.length === 1) {
      recordsValue = root[arrayKeys[0]];
    } else {
      return { ok: false, error: { message: 'Could not auto-detect the repeating record element — name it explicitly.' } };
    }
  }

  const records = (Array.isArray(recordsValue) ? recordsValue : [recordsValue]).filter(isPlainObject);
  if (records.length === 0) return { ok: false, error: { message: 'No record elements were found.' } };

  const columns: string[] = [];
  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (!columns.includes(key)) columns.push(key);
    }
  }

  const rows = records.map((record) =>
    columns.map((column) => {
      const value = record[column];
      if (value === undefined) return '';
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
    }),
  );

  return { ok: true, output: Papa.unparse([columns, ...rows], { newline: '\n' }) };
}

function csvToXml(input: string, recordElement: string): XmlCsvResult {
  if (input.trim() === '') return { ok: false, error: { message: 'Enter some CSV.' } };

  const parsed = Papa.parse<Record<string, string>>(input, { header: true, skipEmptyLines: true });
  // A single-column CSV has no delimiter to detect; Papa still parses it correctly and just warns.
  const fatalErrors = parsed.errors.filter((error) => error.code !== 'UndetectableDelimiter');
  if (fatalErrors.length > 0) return { ok: false, error: { message: fatalErrors[0].message } };

  const fields = parsed.meta.fields ?? [];
  if (fields.length === 0) return { ok: false, error: { message: 'No header row found.' } };

  const recordTag = recordElement.trim() || 'record';
  const records = parsed.data.map((row) => Object.fromEntries(fields.map((field) => [field, row[field] ?? ''])));

  const builder = new XMLBuilder({ ...PARSER_OPTIONS, format: true, indentBy: '  ' });
  // `XMLBuilder` unconditionally prefixes formatted output with a newline — trim it off.
  return { ok: true, output: (builder.build({ root: { [recordTag]: records } }) as string).trim() };
}

export function convertXmlCsv(input: string, direction: XmlCsvDirection, recordElement: string): XmlCsvResult {
  return direction === 'xml-to-csv' ? xmlToCsv(input, recordElement) : csvToXml(input, recordElement);
}
