import { KeyValuePair } from "@dude/shared-types/shared/models/key-value-pair.model";

const REQUEST_LINE_PATTERN = /^[A-Z]+\s+\S+\s+HTTP\/\d(\.\d)?$/i;
const STATUS_LINE_PATTERN = /^HTTP\/\d(\.\d)?\s+\d{3}/i;

/**
 * Parses raw header text into ordered key/value pairs. Tolerant of:
 * - extra whitespace around ':' and around values
 * - a leading HTTP request line ("GET /path HTTP/1.1") or status line ("HTTP/1.1 200 OK")
 * - a full request/response dump — parsing stops at the first blank line (body is ignored)
 * Lines with no ':' are silently skipped. Folded header continuation lines
 * (RFC 7230 obsolete line folding) are NOT supported — a continuation line
 * is simply dropped like any other unparsable line.
 */
export function parseHeaders(raw: string): readonly KeyValuePair[] {
  const trimmed = raw.replace(/[\r\n]+$/, '');
  if (trimmed === '') return [];

  const pairs: KeyValuePair[] = [];

  for (const line of trimmed.split(/\r\n|\r|\n/)) {
    if (line.trim() === '') break;

    if (pairs.length === 0 && (REQUEST_LINE_PATTERN.test(line.trim()) || STATUS_LINE_PATTERN.test(line.trim()))) {
      continue;
    }

    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (key === '') continue;

    pairs.push({ key, value });
  }

  return pairs;
}

/** Serializes pairs back to "Name: value" lines, one per pair, skipping empty keys. */
export function buildHeaders(pairs: readonly KeyValuePair[]): string {
  return pairs
    .filter((pair) => pair.key !== '')
    .map((pair) => `${pair.key}: ${pair.value}`)
    .join('\n');
}
