/**
 * Pure, framework-free parse/build for the `Accept:` request header (RFC 9110 §12.5.1) —
 * a comma-separated list of media types each with an optional `;q=` preference weight.
 * Represented as `KeyValuePair[]` (type -> q) so it can drive `app-key-value-editor` directly.
 */
import { KeyValuePair } from "@dude/shared-types/shared/models/key-value-pair.model";

export function parseAcceptHeader(raw: string): readonly KeyValuePair[] {
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map((part) => {
      const segments = part.split(';').map((s) => s.trim());
      const type = segments[0];
      const qSegment = segments.find((s) => s.toLowerCase().startsWith('q='));
      const q = qSegment ? qSegment.slice(2).trim() : '';
      return { key: type, value: q };
    });
}

export function buildAcceptHeader(pairs: readonly KeyValuePair[]): string {
  return pairs
    .filter((pair) => pair.key !== '')
    .map((pair) => (pair.value !== '' ? `${pair.key};q=${pair.value}` : pair.key))
    .join(', ');
}

function qOf(pair: KeyValuePair): number {
  const parsed = Number(pair.value);
  return pair.value === '' || Number.isNaN(parsed) ? 1 : parsed;
}

/** Stable sort by descending q (RFC 9110 §12.4.2 content negotiation preference order). */
export function sortByPreference(pairs: readonly KeyValuePair[]): readonly KeyValuePair[] {
  return pairs.map((pair, index) => ({ pair, index })).sort((a, b) => qOf(b.pair) - qOf(a.pair) || a.index - b.index).map(({ pair }) => pair);
}
