/**
 * Pure, framework-free CSV pivot used by the CSV Pivot tool. Shared as-is
 * between the main thread (small inputs) and `csv-pivot.worker.ts` (large
 * inputs).
 */

import Papa from 'papaparse';

export type CsvPivotAggregation = 'sum' | 'count' | 'avg';

export interface CsvPivotError {
  readonly message: string;
}

export interface CsvPivotTable {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export type CsvPivotResult = { readonly ok: true; readonly table: CsvPivotTable } | { readonly ok: false; readonly error: CsvPivotError };

interface Cell {
  count: number;
  sum: number;
  numericCount: number;
}

function formatNumber(value: number): string {
  return String(Number(value.toFixed(4)));
}

export function pivotCsv(
  input: string,
  rowKeyColumn: string,
  columnKeyColumn: string,
  valueColumn: string,
  aggregation: CsvPivotAggregation,
): CsvPivotResult {
  if (input.trim() === '') return { ok: false, error: { message: 'Enter some CSV.' } };
  if (rowKeyColumn.trim() === '') return { ok: false, error: { message: 'Enter the row key column.' } };
  if (columnKeyColumn.trim() === '') return { ok: false, error: { message: 'Enter the column key column.' } };
  if (valueColumn.trim() === '') return { ok: false, error: { message: 'Enter the value column.' } };

  const parsed = Papa.parse<Record<string, string>>(input, { header: true, skipEmptyLines: true });
  // A single-column CSV has no delimiter to detect; Papa still parses it correctly and just warns.
  const fatalErrors = parsed.errors.filter((error) => error.code !== 'UndetectableDelimiter');
  if (fatalErrors.length > 0) return { ok: false, error: { message: fatalErrors[0].message } };

  const fields = parsed.meta.fields ?? [];
  for (const [label, column] of [
    ['row key', rowKeyColumn],
    ['column key', columnKeyColumn],
    ['value', valueColumn],
  ] as const) {
    if (!fields.includes(column)) return { ok: false, error: { message: `The ${label} column "${column}" was not found in the header.` } };
  }

  const groups = new Map<string, Map<string, Cell>>();
  const columnKeys = new Set<string>();

  for (const row of parsed.data) {
    const rowKey = row[rowKeyColumn] ?? '';
    const columnKey = row[columnKeyColumn] ?? '';
    columnKeys.add(columnKey);

    const rawValue = (row[valueColumn] ?? '').trim();
    const numericValue = Number(rawValue);
    const isNumeric = rawValue !== '' && !Number.isNaN(numericValue);

    const rowGroup = groups.get(rowKey) ?? new Map<string, Cell>();
    groups.set(rowKey, rowGroup);
    const cell = rowGroup.get(columnKey) ?? { count: 0, sum: 0, numericCount: 0 };
    cell.count += 1;
    if (isNumeric) {
      cell.sum += numericValue;
      cell.numericCount += 1;
    }
    rowGroup.set(columnKey, cell);
  }

  const sortedColumnKeys = [...columnKeys].sort();
  const sortedRowKeys = [...groups.keys()].sort();

  const columns = [rowKeyColumn, ...sortedColumnKeys];
  const rows = sortedRowKeys.map((rowKey) => {
    const rowGroup = groups.get(rowKey);
    const cells = sortedColumnKeys.map((columnKey) => {
      const cell = rowGroup?.get(columnKey);
      if (!cell) return '';
      if (aggregation === 'count') return String(cell.count);
      if (aggregation === 'sum') return formatNumber(cell.sum);
      return cell.numericCount > 0 ? formatNumber(cell.sum / cell.numericCount) : '0';
    });
    return [rowKey, ...cells];
  });

  return { ok: true, table: { columns, rows } };
}
