import { ErrorCodeCategory, ErrorCodeEntry } from "./error-codes-data.js";

/**
 * Filters one category's entries by code/name/description (case-insensitive substring match).
 * Matching the code is deliberately loose — a search for "80070005" matches "0x80070005", so users
 * don't have to know whether a value is usually written with a leading "0x".
 */
export function filterErrorCodes(data: readonly ErrorCodeEntry[], category: ErrorCodeCategory, filterText: string): readonly ErrorCodeEntry[] {
  const normalized = filterText.trim().toLowerCase();
  const inCategory = data.filter((entry) => entry.category === category);
  if (normalized === '') return inCategory;

  return inCategory.filter(
    (entry) =>
      entry.code.toLowerCase().includes(normalized) ||
      entry.code.toLowerCase().replace(/^0x/, '').includes(normalized) ||
      entry.name.toLowerCase().includes(normalized) ||
      entry.description.toLowerCase().includes(normalized),
  );
}
