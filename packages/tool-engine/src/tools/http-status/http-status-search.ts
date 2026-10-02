import { HttpStatusCategory, HttpStatusEntry } from "../../shared/utils/http-status-codes.js";

const CATEGORY_ORDER: readonly HttpStatusCategory[] = [
  '1xx Informational',
  '2xx Success',
  '3xx Redirection',
  '4xx Client Error',
  '5xx Server Error',
];

export interface HttpStatusGroup {
  readonly category: HttpStatusCategory;
  readonly entries: readonly HttpStatusEntry[];
}

/**
 * Filters the status code table by code/name/description (case-insensitive
 * substring match) and groups the results by category in 1xx→5xx order,
 * each group sorted by code ascending. Empty filter text returns everything.
 */
export function filterHttpStatusCodes(
  data: readonly HttpStatusEntry[],
  filterText: string,
): readonly HttpStatusGroup[] {
  const normalized = filterText.trim().toLowerCase();

  const matches = (entry: HttpStatusEntry): boolean => {
    if (normalized === '') return true;
    return (
      entry.code.toString().includes(normalized) ||
      entry.name.toLowerCase().includes(normalized) ||
      entry.description.toLowerCase().includes(normalized)
    );
  };

  return CATEGORY_ORDER.map((category) => ({
    category,
    entries: data.filter((entry) => entry.category === category && matches(entry)).sort((a, b) => a.code - b.code),
  })).filter((group) => group.entries.length > 0);
}
