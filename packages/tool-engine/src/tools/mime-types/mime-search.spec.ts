import { MimeTypeEntry } from "./mime-type-data.js";
import { MIME_RESULTS_LIMIT, filterMimeTypes } from "./mime-search.js";

const DATA: readonly MimeTypeEntry[] = [
  { type: 'application/json', topLevelType: 'application' },
  { type: 'application/xml', topLevelType: 'application' },
  { type: 'text/plain', topLevelType: 'text' },
  { type: 'image/png', topLevelType: 'image' },
];

const OVERLAY: Readonly<Record<string, string>> = { json: 'application/json', txt: 'text/plain' };

describe('filterMimeTypes', () => {
  it('matches by substring, case-insensitively', () => {
    const result = filterMimeTypes(DATA, OVERLAY, { text: 'JSON', topLevelType: 'all' });
    expect(result.rows.map((r) => r.type)).toEqual(['application/json']);
  });

  it('resolves an exact extension match (with or without a leading dot) and pins it to the top', () => {
    const withoutDot = filterMimeTypes(DATA, OVERLAY, { text: 'json', topLevelType: 'all' });
    const withDot = filterMimeTypes(DATA, OVERLAY, { text: '.json', topLevelType: 'all' });

    expect(withoutDot.rows[0]).toEqual({ type: 'application/json', topLevelType: 'application', matchedViaExtension: 'json' });
    expect(withDot.rows[0]).toEqual(withoutDot.rows[0]);
  });

  it('does not duplicate a row that matches both the extension overlay and the text filter', () => {
    const result = filterMimeTypes(DATA, OVERLAY, { text: 'json', topLevelType: 'all' });
    expect(result.rows).toHaveLength(1);
  });

  it('combines a top-level-type filter with a text filter', () => {
    const result = filterMimeTypes(DATA, OVERLAY, { text: 'plain', topLevelType: 'text' });
    expect(result.rows.map((r) => r.type)).toEqual(['text/plain']);

    const noMatch = filterMimeTypes(DATA, OVERLAY, { text: 'plain', topLevelType: 'image' });
    expect(noMatch.rows).toEqual([]);
  });

  it('returns everything (subject to the top-level filter) when the text is empty', () => {
    const result = filterMimeTypes(DATA, OVERLAY, { text: '', topLevelType: 'all' });
    expect(result.rows).toHaveLength(4);
  });

  it('truncates at MIME_RESULTS_LIMIT and reports the true total', () => {
    const bigData: MimeTypeEntry[] = Array.from({ length: MIME_RESULTS_LIMIT + 5 }, (_, i) => ({
      type: `application/x-generated-${i}`,
      topLevelType: 'application' as const,
    }));

    const result = filterMimeTypes(bigData, {}, { text: 'generated', topLevelType: 'all' });
    expect(result.rows).toHaveLength(MIME_RESULTS_LIMIT);
    expect(result.totalMatches).toBe(MIME_RESULTS_LIMIT + 5);
    expect(result.truncated).toBe(true);
  });

  it('returns an empty result when nothing matches', () => {
    const result = filterMimeTypes(DATA, OVERLAY, { text: 'nonexistent', topLevelType: 'all' });
    expect(result).toEqual({ rows: [], totalMatches: 0, truncated: false });
  });
});
