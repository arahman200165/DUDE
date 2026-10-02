/**
 * Pure, framework-free export of generated mock data rows to JSON, NDJSON,
 * CSV, SQL, XML, or YAML. Reuses the CSV<->SQL Converter's `sqlValue` quoting
 * helper and the same `fast-xml-parser`/`js-yaml` libraries already used
 * elsewhere in the app, rather than introducing new ones.
 */
import Papa from 'papaparse';
import { XMLBuilder } from 'fast-xml-parser';
import { dump as dumpYaml } from 'js-yaml';
import { sqlValue } from "../csv-sql/csv-sql-transform.js";
import type { MockDataRow } from "./mock-data-schema.js";

export type MockDataExportFormat = 'json' | 'ndjson' | 'csv' | 'sql' | 'xml' | 'yaml';

export interface MockDataExport {
  readonly text: string;
  readonly filename: string;
  readonly mimeType: string;
}

function toStringValue(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toCsv(rows: readonly MockDataRow[]): string {
  return Papa.unparse(rows.map((row) => row));
}

function toSql(rows: readonly MockDataRow[], tableName: string): string {
  if (rows.length === 0) return '';
  const columns = Object.keys(rows[0]);
  const columnList = columns.join(', ');
  return rows
    .map((row) => `INSERT INTO ${tableName} (${columnList}) VALUES (${columns.map((column) => sqlValue(toStringValue(row[column]))).join(', ')});`)
    .join('\n');
}

function toXml(rows: readonly MockDataRow[]): string {
  const builder = new XMLBuilder({ format: true, indentBy: '  ' });
  return (builder.build({ rows: { row: rows } }) as string).trim();
}

const exporters: Record<MockDataExportFormat, (rows: readonly MockDataRow[], tableName: string) => string> = {
  json: (rows) => JSON.stringify(rows, null, 2),
  ndjson: (rows) => rows.map((row) => JSON.stringify(row)).join('\n'),
  csv: toCsv,
  sql: toSql,
  xml: toXml,
  yaml: (rows) => dumpYaml(rows),
};

const extensions: Record<MockDataExportFormat, string> = {
  json: 'json',
  ndjson: 'ndjson',
  csv: 'csv',
  sql: 'sql',
  xml: 'xml',
  yaml: 'yaml',
};

const mimeTypes: Record<MockDataExportFormat, string> = {
  json: 'application/json',
  ndjson: 'application/x-ndjson',
  csv: 'text/csv',
  sql: 'application/sql',
  xml: 'application/xml',
  yaml: 'application/yaml',
};

export function formatMockDataExport(rows: readonly MockDataRow[], format: MockDataExportFormat, tableName: string): MockDataExport {
  return {
    text: exporters[format](rows, tableName || 'mock_data'),
    filename: `mock-data.${extensions[format]}`,
    mimeType: mimeTypes[format],
  };
}
