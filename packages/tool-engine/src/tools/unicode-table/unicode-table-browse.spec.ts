import { PAGE_SIZE, runUnicodeTableRequest } from "./unicode-table-browse.js";

describe('runUnicodeTableRequest — browse', () => {
  it('returns the full block when smaller than a page', () => {
    const result = runUnicodeTableRequest({ mode: 'browse', blockName: 'Basic Latin', page: 0 });
    expect(result.totalInScope).toBe(128);
    expect(result.rows).toHaveLength(128);
    expect(result.rows[0].codePointHex).toBe('U+0000');
    expect(result.rows[65].char).toBe('A');
  });

  it('paginates a block larger than PAGE_SIZE', () => {
    const page0 = runUnicodeTableRequest({ mode: 'browse', blockName: 'CJK Unified Ideographs', page: 0 });
    const page1 = runUnicodeTableRequest({ mode: 'browse', blockName: 'CJK Unified Ideographs', page: 1 });
    expect(page0.rows).toHaveLength(PAGE_SIZE);
    expect(page1.rows).toHaveLength(PAGE_SIZE);
    expect(page0.rows[0].codePointDecimal).not.toBe(page1.rows[0].codePointDecimal);
    expect(page0.totalInScope).toBe(page1.totalInScope);
  });

  it('throws for an unknown block name', () => {
    expect(() => runUnicodeTableRequest({ mode: 'browse', blockName: 'Not A Real Block', page: 0 })).toThrow();
  });
});

describe('runUnicodeTableRequest — search', () => {
  it('resolves an exact U+ code point lookup', () => {
    const result = runUnicodeTableRequest({ mode: 'search', query: 'U+0041', scope: 'all' });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].char).toBe('A');
    expect(result.rows[0].name).toBe('LATIN CAPITAL LETTER A');
  });

  it('resolves a single literal character lookup', () => {
    const result = runUnicodeTableRequest({ mode: 'search', query: 'A', scope: 'all' });
    expect(result.rows[0].codePointDecimal).toBe(65);
  });

  it('searches by name within a single block', () => {
    const result = runUnicodeTableRequest({
      mode: 'search',
      query: 'LATIN SMALL LETTER A',
      scope: 'block',
      blockName: 'Basic Latin',
    });
    expect(result.rows.some((r) => r.char === 'a')).toBe(true);
  });

  it('does not search outside the given block when scope is block', () => {
    const result = runUnicodeTableRequest({
      mode: 'search',
      query: 'GREEK',
      scope: 'block',
      blockName: 'Basic Latin',
    });
    expect(result.rows).toHaveLength(0);
  });

  it('returns nothing for blank query', () => {
    expect(runUnicodeTableRequest({ mode: 'search', query: '', scope: 'all' }).rows).toEqual([]);
  });
});
