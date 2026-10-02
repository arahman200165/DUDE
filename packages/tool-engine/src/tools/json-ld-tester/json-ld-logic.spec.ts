import { validateJsonLd } from "./json-ld-logic.js";

describe('validateJsonLd', () => {
  it('reports no findings for a fully valid Article', () => {
    const result = validateJsonLd(
      JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'Title',
        author: { '@type': 'Person', name: 'Jane' },
        datePublished: '2026-01-01',
        image: 'https://example.com/a.png',
        publisher: { '@type': 'Organization', name: 'Pub' },
        dateModified: '2026-01-02',
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.findings).toHaveLength(0);
  });

  it('flags missing required properties for a detected @type', () => {
    const result = validateJsonLd(JSON.stringify({ '@context': 'https://schema.org', '@type': 'Article' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const errors = result.findings.filter((f) => f.severity === 'error');
    expect(errors.some((f) => f.message.includes('headline'))).toBe(true);
    expect(errors.some((f) => f.message.includes('author'))).toBe(true);
    expect(errors.some((f) => f.message.includes('datePublished'))).toBe(true);
  });

  it('flags a missing @context', () => {
    const result = validateJsonLd(JSON.stringify({ '@type': 'Product', name: 'x' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.findings.some((f) => f.severity === 'error' && f.message.includes('@context'))).toBe(true);
  });

  it('flags a missing @type', () => {
    const result = validateJsonLd(JSON.stringify({ '@context': 'https://schema.org' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.findings.some((f) => f.severity === 'error' && f.message.includes('@type'))).toBe(true);
  });

  it('warns (not errors) on an unrecognized @type', () => {
    const result = validateJsonLd(JSON.stringify({ '@context': 'https://schema.org', '@type': 'SomeUnknownType' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.findings).toEqual([{ severity: 'warning', message: expect.stringContaining('unrecognized @type') }]);
  });

  it('validates each node inside an @graph array', () => {
    const result = validateJsonLd(
      JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [{ '@type': 'Person', name: 'Jane' }, { '@type': 'Organization' }],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.findings.some((f) => f.message.includes('@graph[1]') && f.message.includes('name'))).toBe(true);
  });

  it('returns a parse error for invalid JSON', () => {
    const result = validateJsonLd('{ not json');
    expect(result.ok).toBe(false);
  });

  it('returns a parse error for empty input', () => {
    expect(validateJsonLd('')).toEqual({ ok: false, parseError: 'Enter a JSON-LD block to validate.' });
  });
});
