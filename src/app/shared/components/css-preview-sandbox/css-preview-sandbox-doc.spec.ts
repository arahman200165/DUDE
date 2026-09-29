import { buildCssPreviewDoc } from './css-preview-sandbox-doc';

describe('buildCssPreviewDoc', () => {
  it('embeds the given CSS in a <style> tag', () => {
    const doc = buildCssPreviewDoc('.box { color: red; }', '<div class="box">x</div>');
    expect(doc).toContain('<style>.box { color: red; }</style>');
  });

  it('embeds the given HTML verbatim', () => {
    const doc = buildCssPreviewDoc('', '<div class="box">x</div>');
    expect(doc).toContain('<div class="box">x</div>');
  });

  it('disallows script execution entirely', () => {
    const doc = buildCssPreviewDoc('', '');
    expect(doc).toContain("script-src 'none'");
  });

  it('blocks network access', () => {
    const doc = buildCssPreviewDoc('', '');
    expect(doc).toContain("connect-src 'none'");
  });

  it('allows inline styles to apply', () => {
    const doc = buildCssPreviewDoc('', '');
    expect(doc).toContain("style-src 'unsafe-inline'");
  });

  it('prepends the CSP before the style and markup', () => {
    const doc = buildCssPreviewDoc('.a{}', '<!--marker-->');
    expect(doc.indexOf('Content-Security-Policy')).toBeLessThan(doc.indexOf('<!--marker-->'));
  });
});

describe('buildCssPreviewDoc paused option', () => {
  it('appends the pause style after the user CSS', () => {
    const doc = buildCssPreviewDoc('.a{}', '<b></b>', { paused: true });
    expect(doc).toContain('animation-play-state:paused!important');
    expect(doc.indexOf('animation-play-state:paused')).toBeGreaterThan(doc.indexOf('<style>.a{}</style>'));
  });

  it('has no pause style by default', () => {
    expect(buildCssPreviewDoc('.a{}', '')).not.toContain('animation-play-state');
    expect(buildCssPreviewDoc('.a{}', '', { paused: false })).not.toContain('animation-play-state');
  });
});
