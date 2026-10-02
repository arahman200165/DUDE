import { buildAcceptHeader, parseAcceptHeader, sortByPreference } from "./accept-header.js";

describe('parseAcceptHeader', () => {
  it('parses media types with and without a q value', () => {
    expect(parseAcceptHeader('text/html, application/json;q=0.9, */*;q=0.1')).toEqual([
      { key: 'text/html', value: '' },
      { key: 'application/json', value: '0.9' },
      { key: '*/*', value: '0.1' },
    ]);
  });

  it('returns an empty array for empty input', () => {
    expect(parseAcceptHeader('')).toEqual([]);
  });
});

describe('buildAcceptHeader', () => {
  it('joins entries, omitting q for entries with an empty value', () => {
    expect(
      buildAcceptHeader([
        { key: 'text/html', value: '' },
        { key: 'application/json', value: '0.9' },
      ]),
    ).toBe('text/html, application/json;q=0.9');
  });

  it('round-trips through parseAcceptHeader', () => {
    const original = 'text/html, application/json;q=0.9, */*;q=0.1';
    expect(buildAcceptHeader(parseAcceptHeader(original))).toBe(original);
  });

  it('drops entries with an empty type', () => {
    expect(buildAcceptHeader([{ key: '', value: '0.5' }, { key: 'text/html', value: '' }])).toBe('text/html');
  });
});

describe('sortByPreference', () => {
  it('sorts descending by q, treating an empty value as q=1', () => {
    const pairs = [
      { key: 'application/json', value: '0.9' },
      { key: 'text/html', value: '' },
      { key: '*/*', value: '0.1' },
    ];
    expect(sortByPreference(pairs).map((p) => p.key)).toEqual(['text/html', 'application/json', '*/*']);
  });

  it('is stable for equal q values', () => {
    const pairs = [
      { key: 'a', value: '0.5' },
      { key: 'b', value: '0.5' },
    ];
    expect(sortByPreference(pairs).map((p) => p.key)).toEqual(['a', 'b']);
  });
});
