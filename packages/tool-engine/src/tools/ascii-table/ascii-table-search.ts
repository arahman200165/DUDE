import { AsciiEntry } from "./ascii-table-data.js";

/**
 * Filters the ASCII table by decimal, hex, octal, character, or name
 * (case-insensitive substring match). Empty filter text returns everything.
 */
export function filterAsciiTable(data: readonly AsciiEntry[], filterText: string): readonly AsciiEntry[] {
  const normalized = filterText.trim().toLowerCase();
  if (normalized === '') return data;

  return data.filter(
    (entry) =>
      entry.decimal.toString().includes(normalized) ||
      entry.hex.toLowerCase().includes(normalized) ||
      entry.octal.includes(normalized) ||
      entry.char.toLowerCase().includes(normalized) ||
      entry.name.toLowerCase().includes(normalized),
  );
}
