import { buildBlankPreviewDoc, buildLiveHtmlPreviewDoc } from "./live-html-preview-doc.js";

describe('buildLiveHtmlPreviewDoc', () => {
  it('embeds the user source verbatim', () => {
    const doc = buildLiveHtmlPreviewDoc('<h1>Hello</h1>', 1);
    expect(doc).toContain('<h1>Hello</h1>');
  });

  it('includes a CSP blocking script-initiated network access while allowing passive images', () => {
    const doc = buildLiveHtmlPreviewDoc('<p>x</p>', 1);
    expect(doc).toContain("connect-src 'none'");
    expect(doc).toContain('img-src data: blob: https:');
  });

  it('allows inline scripts and styles to run', () => {
    const doc = buildLiveHtmlPreviewDoc('<script>1</script>', 1);
    expect(doc).toContain("script-src 'unsafe-inline'");
    expect(doc).toContain("style-src 'unsafe-inline'");
  });

  it('installs the console capture bootstrap tagged with the given render id, as a string', () => {
    const doc = buildLiveHtmlPreviewDoc('<p>x</p>', 42);
    expect(doc).toContain('var requestId = "42";');
  });

  it('prepends the CSP and bootstrap before the user source', () => {
    const doc = buildLiveHtmlPreviewDoc('<!--marker-->', 1);
    expect(doc.indexOf('Content-Security-Policy')).toBeLessThan(doc.indexOf('<!--marker-->'));
  });
});

describe('buildBlankPreviewDoc', () => {
  it('returns an inert empty document', () => {
    expect(buildBlankPreviewDoc()).toBe('<!DOCTYPE html><html><body></body></html>');
  });
});
