import { MimeTopLevelType, MimeTypeEntry } from "./mime-type-data.js";

export const MIME_RESULTS_LIMIT = 200;

export interface MimeFilterOptions {
  readonly text: string;
  readonly topLevelType: MimeTopLevelType | 'all';
}

export interface MimeFilterResultRow {
  readonly type: string;
  readonly topLevelType: MimeTopLevelType;
  readonly matchedViaExtension?: string;
}

export interface MimeFilterResult {
  readonly rows: readonly MimeFilterResultRow[];
  readonly totalMatches: number;
  readonly truncated: boolean;
}

function normalizeText(text: string): string {
  const trimmed = text.trim().toLowerCase();
  return trimmed.startsWith('.') ? trimmed.slice(1) : trimmed;
}

/**
 * Filters the MIME type table by top-level type and by a text query matched
 * against the type string, with an exact-extension overlay match pinned to
 * the top. Results are capped at MIME_RESULTS_LIMIT — reference lookups are
 * searched, not scrolled, and no virtualization primitive exists in the
 * codebase for a 1000+-row table.
 */
export function filterMimeTypes(
  data: readonly MimeTypeEntry[],
  overlay: Readonly<Record<string, string>>,
  options: MimeFilterOptions,
): MimeFilterResult {
  const normalizedText = normalizeText(options.text);

  const byTopLevel = data.filter(
    (entry) => options.topLevelType === 'all' || entry.topLevelType === options.topLevelType,
  );

  const rows: MimeFilterResultRow[] = [];
  const seenTypes = new Set<string>();

  const extensionMatch = normalizedText !== '' ? overlay[normalizedText] : undefined;
  if (extensionMatch !== undefined) {
    const entry = byTopLevel.find((candidate) => candidate.type === extensionMatch);
    if (entry) {
      rows.push({ ...entry, matchedViaExtension: normalizedText });
      seenTypes.add(entry.type);
    }
  }

  const textMatches =
    normalizedText === ''
      ? byTopLevel
      : byTopLevel.filter((entry) => entry.type.toLowerCase().includes(normalizedText));

  for (const entry of textMatches) {
    if (seenTypes.has(entry.type)) continue;
    rows.push(entry);
    seenTypes.add(entry.type);
  }

  return {
    rows: rows.slice(0, MIME_RESULTS_LIMIT),
    totalMatches: rows.length,
    truncated: rows.length > MIME_RESULTS_LIMIT,
  };
}
