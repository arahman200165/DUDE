import type { CsvDelimiter } from '@dude/tool-engine/tools/csv-viewer/csv-convert';

/** Android input cap: the engine parses ~200 KB in 4-6 s on a device, so larger inputs are refused with a message. */
export const MAX_INPUT_CHARS = 512 * 1024;
/** Rows rendered in the grid; the counts and the JSON export always cover every row. */
export const MAX_RENDERED_ROWS = 500;
/** Above this size a "this can take a while" hint is shown while parsing. */
export const SLOW_INPUT_CHARS = 100_000;

export const decodeDelimiter = (raw: unknown): CsvDelimiter | null => (raw === ',' || raw === ';' || raw === '\t' ? raw : null);

export const countLabel = (count: number, noun: string): string => `${count.toLocaleString('en-US')} ${noun}${count === 1 ? '' : 's'}`;
export const summaryLabel = (rows: number, columns: number): string => `${countLabel(rows, 'row')}, ${countLabel(columns, 'column')}`;
export const shownLabel = (shown: number, total: number): string => `Showing ${shown.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} rows`;

export function oversizeMessage(length: number): string | null {
  return length > MAX_INPUT_CHARS
    ? `This input is ${Math.ceil(length / 1024).toLocaleString('en-US')} KiB. CSV Viewer on Android parses at most ${MAX_INPUT_CHARS / 1024} KiB; trim the input or use the desktop or web app for larger files.`
    : null;
}

/** Column width in characters for the grid, from the header and the first rows (bounded so one long cell cannot dominate). */
export function columnWidths(columns: readonly string[], rows: readonly (readonly string[])[], sample = 50): number[] {
  return columns.map((column, index) => {
    let widest = column.length;
    for (let row = 0; row < Math.min(rows.length, sample); row += 1) widest = Math.max(widest, (rows[row]![index] ?? '').length);
    return Math.min(32, Math.max(8, widest + 2));
  });
}
