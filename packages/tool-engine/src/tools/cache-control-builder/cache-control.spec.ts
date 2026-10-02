import { buildCacheControl, checkCacheControlWarnings, directivesFor, parseCacheControl } from "./cache-control.js";

describe('parseCacheControl', () => {
  it('parses boolean flags and valued directives', () => {
    expect(parseCacheControl('public, max-age=3600, must-revalidate')).toEqual([
      { name: 'public', value: null },
      { name: 'max-age', value: '3600' },
      { name: 'must-revalidate', value: null },
    ]);
  });

  it('lowercases directive names', () => {
    expect(parseCacheControl('No-Store')).toEqual([{ name: 'no-store', value: null }]);
  });

  it('returns an empty array for empty input', () => {
    expect(parseCacheControl('')).toEqual([]);
  });
});

describe('buildCacheControl', () => {
  it('round-trips through parseCacheControl', () => {
    const original = 'public, max-age=3600, must-revalidate';
    expect(buildCacheControl(parseCacheControl(original))).toBe(original);
  });

  it('omits the "=" for a boolean flag', () => {
    expect(buildCacheControl([{ name: 'no-store', value: null }])).toBe('no-store');
  });
});

describe('directivesFor', () => {
  it('returns distinct directive sets for request vs response', () => {
    const request = directivesFor('request').map((d) => d.name);
    const response = directivesFor('response').map((d) => d.name);
    expect(request).toContain('only-if-cached');
    expect(response).not.toContain('only-if-cached');
    expect(response).toContain('s-maxage');
    expect(request).not.toContain('s-maxage');
  });
});

describe('checkCacheControlWarnings', () => {
  it('flags no-store alongside max-age', () => {
    const warnings = checkCacheControlWarnings([
      { name: 'no-store', value: null },
      { name: 'max-age', value: '60' },
    ]);
    expect(warnings.some((w) => w.includes('no-store overrides'))).toBe(true);
  });

  it('flags public and private both set', () => {
    const warnings = checkCacheControlWarnings([
      { name: 'public', value: null },
      { name: 'private', value: null },
    ]);
    expect(warnings.some((w) => w.includes('contradictory'))).toBe(true);
  });

  it('returns no warnings for a clean directive set', () => {
    expect(checkCacheControlWarnings([{ name: 'public', value: null }, { name: 'max-age', value: '3600' }])).toEqual([]);
  });
});
