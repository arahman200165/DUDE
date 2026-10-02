/**
 * Pure, framework-free CSV filter/sort used by the CSV Filter / Sort tool.
 * Shared as-is between the main thread (small inputs) and
 * `csv-filter-sort.worker.ts` (large inputs).
 */

import Papa from 'papaparse';

export type CsvFilterOperator = 'contains' | 'equals' | 'not-empty' | 'gt' | 'lt';
export type CsvSortDirection = 'asc' | 'desc';

export interface CsvFilterSortError {
  readonly message: string;
}

export interface CsvFilterSortTable {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export type CsvFilterSortResult =
  | { readonly ok: true; readonly table: CsvFilterSortTable }
  | { readonly ok: false; readonly error: CsvFilterSortError };

const NUMERIC = /^-?\d+(\.\d+)?$/;

function matchesFilter(cell: string, operator: CsvFilterOperator, value: string): boolean {
  switch (operator) {
    case 'contains':
      return cell.toLowerCase().includes(value.trim().toLowerCase());
    case 'equals':
      return cell.trim() === value.trim();
    case 'not-empty':
      return cell.trim() !== '';
    case 'gt':
    case 'lt': {
      const cellValue = Number(cell.trim());
      const compareValue = Number(value.trim());
      if (Number.isNaN(cellValue) || Number.isNaN(compareValue)) return false;
      return operator === 'gt' ? cellValue > compareValue : cellValue < compareValue;
    }
  }
}

export function filterSortCsv(
  input: string,
  filterColumn: string,
  operator: CsvFilterOperator,
  filterValue: string,
  sortColumn: string,
  sortDirection: CsvSortDirection,
): CsvFilterSortResult {
  if (input.trim() === '') return { ok: false, error: { message: 'Enter some CSV.' } };

  const parsed = Papa.parse<Record<string, string>>(input, { header: true, skipEmptyLines: true });
  // A single-column CSV has no delimiter to detect; Papa still parses it correctly and just warns.
  const fatalErrors = parsed.errors.filter((error) => error.code !== 'UndetectableDelimiter');
  if (fatalErrors.length > 0) return { ok: false, error: { message: fatalErrors[0].message } };

  const fields = parsed.meta.fields ?? [];
  if (filterColumn.trim() !== '' && !fields.includes(filterColumn)) {
    return { ok: false, error: { message: `The filter column "${filterColumn}" was not found in the header.` } };
  }
  if (sortColumn.trim() !== '' && !fields.includes(sortColumn)) {
    return { ok: false, error: { message: `The sort column "${sortColumn}" was not found in the header.` } };
  }

  let rows = parsed.data;
  if (filterColumn.trim() !== '') {
    rows = rows.filter((row) => matchesFilter(row[filterColumn] ?? '', operator, filterValue));
  }

  if (sortColumn.trim() !== '') {
    const allNumeric = rows.every((row) => {
      const value = (row[sortColumn] ?? '').trim();
      return value === '' || NUMERIC.test(value);
    });

    rows = [...rows].sort((a, b) => {
      const aValue = (a[sortColumn] ?? '').trim();
      const bValue = (b[sortColumn] ?? '').trim();
      const comparison = allNumeric ? Number(aValue || 0) - Number(bValue || 0) : aValue.localeCompare(bValue);
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }

  return { ok: true, table: { columns: fields, rows: rows.map((row) => fields.map((field) => row[field] ?? '')) } };
}
