/**
 * Pure, framework-free parse/build for the request `Range:` and response
 * `Content-Range:` headers (RFC 9110). A `ByteRange` uses `KeyValuePair`'s
 * `{key,value}` shape (start -> key, end -> value) so a multi-range Range
 * header can drive `app-key-value-editor` directly; either side empty means
 * an open-ended range (`500-` = from 500 to end, `-500` = last 500 bytes).
 */
import { KeyValuePair } from "@dude/shared-types/shared/models/key-value-pair.model";

export type ByteRange = KeyValuePair; // key = start, value = end

export function parseRangeHeader(raw: string): readonly ByteRange[] {
  const match = /^bytes=(.+)$/i.exec(raw.trim());
  if (!match) return [];

  return match[1]
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map((part) => {
      const dashIndex = part.indexOf('-');
      if (dashIndex === -1) return { key: part, value: '' };
      return { key: part.slice(0, dashIndex).trim(), value: part.slice(dashIndex + 1).trim() };
    });
}

export function buildRangeHeader(ranges: readonly ByteRange[]): string {
  const valid = ranges.filter((r) => r.key !== '' || r.value !== '');
  if (valid.length === 0) return '';
  return `bytes=${valid.map((r) => `${r.key}-${r.value}`).join(',')}`;
}

export function checkRangeWarnings(ranges: readonly ByteRange[]): readonly string[] {
  const warnings: string[] = [];
  for (const range of ranges) {
    if (range.key === '' && range.value === '') {
      warnings.push('A range with neither a start nor an end is meaningless.');
    } else if (range.key !== '' && range.value !== '' && Number(range.key) > Number(range.value)) {
      warnings.push(`Range ${range.key}-${range.value} has a start greater than its end.`);
    }
  }
  return warnings;
}

export interface ContentRange {
  readonly start: string;
  readonly end: string;
  readonly total: string; // empty means unknown ("*")
}

export const EMPTY_CONTENT_RANGE: ContentRange = { start: '', end: '', total: '' };

export function parseContentRangeHeader(raw: string): ContentRange {
  const match = /^bytes\s+(?:\*|(\d+)-(\d+))\/(\*|\d+)$/i.exec(raw.trim());
  if (!match) return EMPTY_CONTENT_RANGE;

  const [, start, end, total] = match;
  return { start: start ?? '', end: end ?? '', total: total === '*' ? '' : total };
}

export function buildContentRangeHeader(range: ContentRange): string {
  const rangePart = range.start === '' && range.end === '' ? '*' : `${range.start}-${range.end}`;
  return `bytes ${rangePart}/${range.total === '' ? '*' : range.total}`;
}
