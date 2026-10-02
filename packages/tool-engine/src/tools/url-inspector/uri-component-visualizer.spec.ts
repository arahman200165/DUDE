import { segmentUri } from "./uri-component-visualizer.js";

function reconstruct(raw: string): string {
  return segmentUri(raw)
    .map((s) => s.text)
    .join('');
}

describe('segmentUri', () => {
  it('returns no segments for empty input', () => {
    expect(segmentUri('')).toEqual([]);
  });

  it('segments a full URL with credentials, port, path, query, and fragment', () => {
    const raw = 'https://user:pass@example.com:8443/a/b?x=1&y=2#section';
    expect(segmentUri(raw)).toEqual([
      { kind: 'scheme', text: 'https' },
      { kind: 'punctuation', text: ':' },
      { kind: 'punctuation', text: '//' },
      { kind: 'userinfo', text: 'user:pass' },
      { kind: 'punctuation', text: '@' },
      { kind: 'host', text: 'example.com' },
      { kind: 'punctuation', text: ':' },
      { kind: 'port', text: '8443' },
      { kind: 'path', text: '/a/b' },
      { kind: 'punctuation', text: '?' },
      { kind: 'query', text: 'x=1&y=2' },
      { kind: 'punctuation', text: '#' },
      { kind: 'fragment', text: 'section' },
    ]);
  });

  it('reconstructs the exact original string for a variety of inputs', () => {
    const samples = [
      'https://user:pass@example.com:8443/a/b?x=1&y=2#section',
      'https://example.com',
      'http://example.com/',
      '//example.com/path',
      '/just/a/path',
      'mailto:user@example.com',
      'not a url at all',
      'ftp://host:21',
      '#only-a-fragment',
      '?only=a-query',
    ];
    for (const raw of samples) {
      expect(reconstruct(raw)).toBe(raw);
    }
  });

  it('handles a bare host with no scheme or path', () => {
    expect(segmentUri('//example.com')).toEqual([
      { kind: 'punctuation', text: '//' },
      { kind: 'host', text: 'example.com' },
    ]);
  });

  it('handles a scheme with no authority (e.g. mailto:)', () => {
    expect(segmentUri('mailto:user@example.com')).toEqual([
      { kind: 'scheme', text: 'mailto' },
      { kind: 'punctuation', text: ':' },
      { kind: 'path', text: 'user@example.com' },
    ]);
  });

  it('treats plain text as an entirely unstructured path', () => {
    expect(segmentUri('just some words')).toEqual([{ kind: 'path', text: 'just some words' }]);
  });

  it('handles a host with no port and no userinfo', () => {
    expect(segmentUri('https://example.com/x')).toEqual([
      { kind: 'scheme', text: 'https' },
      { kind: 'punctuation', text: ':' },
      { kind: 'punctuation', text: '//' },
      { kind: 'host', text: 'example.com' },
      { kind: 'path', text: '/x' },
    ]);
  });
});
