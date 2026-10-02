import { analyzeDomainHomographRisk } from "./url-homograph.js";

describe('analyzeDomainHomographRisk', () => {
  it('does not flag a plain ASCII/Latin domain', () => {
    const result = analyzeDomainHomographRisk('example.com');
    expect(result.ok).toBe(true);
    expect(result.ok && result.mixedScriptRisk).toBe(false);
    expect(result.ok && result.isPunycode).toBe(false);
    expect(result.ok && result.labels.map((l) => l.label)).toEqual(['example', 'com']);
  });

  it('does not flag a legitimate single-script non-Latin domain', () => {
    // яндекс.рф — Yandex's real Cyrillic-only domain.
    const result = analyzeDomainHomographRisk('яндекс.рф');
    expect(result.ok).toBe(true);
    expect(result.ok && result.mixedScriptRisk).toBe(false);
    expect(result.ok && result.labels[0].scripts).toEqual(['Cyrillic']);
  });

  it('flags a label mixing Cyrillic and Latin characters', () => {
    // U+0430 CYRILLIC SMALL LETTER A followed by Latin "pple" — classic homograph of "apple".
    const result = analyzeDomainHomographRisk('аpple.com');
    expect(result.ok).toBe(true);
    expect(result.ok && result.mixedScriptRisk).toBe(true);
    expect(result.ok && [...result.labels[0].scripts].sort()).toEqual(['Cyrillic', 'Latin']);
  });

  it('decodes an already-punycode domain and reports isPunycode', () => {
    const result = analyzeDomainHomographRisk('xn--mnchen-3ya.de');
    expect(result.ok).toBe(true);
    expect(result.ok && result.isPunycode).toBe(true);
    expect(result.ok && result.unicodeDomain).toBe('münchen.de');
    expect(result.ok && result.asciiDomain).toBe('xn--mnchen-3ya.de');
  });

  it('does not count digits or hyphens toward script mixing', () => {
    const result = analyzeDomainHomographRisk('my-site-123.com');
    expect(result.ok).toBe(true);
    expect(result.ok && result.mixedScriptRisk).toBe(false);
  });

  it('errors on empty input', () => {
    expect(analyzeDomainHomographRisk('').ok).toBe(false);
    expect(analyzeDomainHomographRisk('   ').ok).toBe(false);
  });
});
