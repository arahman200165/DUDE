import { unicodeName } from 'unicode-name';
import { UNICODE_BLOCKS } from "../../shared/utils/unicode-blocks.js";
import { generalCategoryOf } from "../../shared/utils/unicode-general-category.js";

export interface UnicodeTableRow {
  readonly codePointHex: string;
  readonly codePointDecimal: number;
  readonly char: string;
  readonly categoryAbbreviation: string;
  readonly categoryLabel: string;
  readonly block: string;
  readonly name: string;
}

export type UnicodeTableRequest =
  | { readonly mode: 'browse'; readonly blockName: string; readonly page: number }
  | { readonly mode: 'search'; readonly query: string; readonly scope: 'all' | 'block'; readonly blockName?: string };

export interface UnicodeTableResult {
  readonly rows: readonly UnicodeTableRow[];
  readonly totalInScope: number;
  readonly truncated: boolean;
}

export const PAGE_SIZE = 500;
const MAX_SEARCH_MATCHES = 200;

function toRow(codePoint: number, block: string): UnicodeTableRow {
  const category = generalCategoryOf(String.fromCodePoint(codePoint));
  return {
    codePointHex: `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`,
    codePointDecimal: codePoint,
    char: String.fromCodePoint(codePoint),
    categoryAbbreviation: category.abbreviation,
    categoryLabel: category.label,
    block,
    name: unicodeName(codePoint) ?? '(unnamed)',
  };
}

function findBlock(blockName: string) {
  const block = UNICODE_BLOCKS.find((b) => b.name === blockName);
  if (!block) throw new Error(`Unknown Unicode block: ${blockName}`);
  return block;
}

function browsePage(blockName: string, page: number): UnicodeTableResult {
  const block = findBlock(blockName);
  const size = block.end - block.start + 1;
  const pageStart = block.start + page * PAGE_SIZE;
  const pageEnd = Math.min(block.end, pageStart + PAGE_SIZE - 1);

  const rows: UnicodeTableRow[] = [];
  for (let cp = pageStart; cp <= pageEnd; cp++) {
    rows.push(toRow(cp, block.name));
  }

  return { rows, totalInScope: size, truncated: false };
}

function parseExactCodePoint(query: string): number | null {
  const trimmed = query.trim();
  const uPlusMatch = /^u\+([0-9a-f]+)$/i.exec(trimmed);
  if (uPlusMatch) return parseInt(uPlusMatch[1], 16);
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  if (Array.from(trimmed).length === 1) return trimmed.codePointAt(0)!;
  return null;
}

function search(query: string, scope: 'all' | 'block', blockName?: string): UnicodeTableResult {
  const exact = parseExactCodePoint(query);
  if (exact !== null && exact >= 0 && exact <= 0x10ffff) {
    const block = UNICODE_BLOCKS.find((b) => exact >= b.start && exact <= b.end);
    return { rows: [toRow(exact, block?.name ?? 'Unassigned / Other')], totalInScope: 1, truncated: false };
  }

  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery === '') return { rows: [], totalInScope: 0, truncated: false };

  const searchRanges = scope === 'block' && blockName ? [findBlock(blockName)] : UNICODE_BLOCKS;

  const rows: UnicodeTableRow[] = [];
  let truncated = false;

  outer: for (const block of searchRanges) {
    for (let cp = block.start; cp <= block.end; cp++) {
      const name = unicodeName(cp);
      if (name && name.toLowerCase().includes(normalizedQuery)) {
        if (rows.length >= MAX_SEARCH_MATCHES) {
          truncated = true;
          break outer;
        }
        rows.push(toRow(cp, block.name));
      }
    }
  }

  return { rows, totalInScope: rows.length, truncated };
}

export function runUnicodeTableRequest(request: UnicodeTableRequest): UnicodeTableResult {
  if (request.mode === 'browse') return browsePage(request.blockName, request.page);
  return search(request.query, request.scope, request.blockName);
}
