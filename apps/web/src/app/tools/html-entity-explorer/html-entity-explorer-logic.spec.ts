import { HTML_ENTITY_TABLE, filterEntityTable } from './html-entity-explorer-logic';

describe('HTML_ENTITY_TABLE', () => {
  it('resolves every curated entity name to a real character', () => {
    expect(HTML_ENTITY_TABLE.length).toBeGreaterThan(100);
    for (const entry of HTML_ENTITY_TABLE) {
      expect(entry.char.length).toBeGreaterThan(0);
    }
  });

  it('resolves &amp; to "&" with the correct codepoint', () => {
    const entry = HTML_ENTITY_TABLE.find((e) => e.name === 'amp');
    expect(entry).toEqual({ name: 'amp', char: '&', decimal: 38, hex: '26' });
  });

  it('resolves &nbsp; to a non-breaking space', () => {
    const entry = HTML_ENTITY_TABLE.find((e) => e.name === 'nbsp');
    expect(entry?.char).toBe(' ');
    expect(entry?.decimal).toBe(160);
  });

  it('resolves &copy; to the copyright sign', () => {
    const entry = HTML_ENTITY_TABLE.find((e) => e.name === 'copy');
    expect(entry?.char).toBe('©');
  });
});

describe('filterEntityTable', () => {
  it('returns the full table for an empty query', () => {
    expect(filterEntityTable(HTML_ENTITY_TABLE, '')).toHaveLength(HTML_ENTITY_TABLE.length);
  });

  it('filters by partial entity name, case-insensitively', () => {
    const results = filterEntityTable(HTML_ENTITY_TABLE, 'COPY');
    expect(results.some((e) => e.name === 'copy')).toBe(true);
  });

  it('filters by exact character', () => {
    const results = filterEntityTable(HTML_ENTITY_TABLE, '©');
    expect(results.some((e) => e.name === 'copy')).toBe(true);
  });

  it('filters by decimal codepoint', () => {
    const results = filterEntityTable(HTML_ENTITY_TABLE, '38');
    expect(results.some((e) => e.name === 'amp')).toBe(true);
  });

  it('filters by hex codepoint', () => {
    const results = filterEntityTable(HTML_ENTITY_TABLE, '26');
    expect(results.some((e) => e.name === 'amp')).toBe(true);
  });
});
