import { inspectUrlSafety } from "./url-safety-inspect.js";

describe('inspectUrlSafety', () => {
  it('reports no findings for a clean, ordinary URL', () => {
    const result = inspectUrlSafety('https://example.com/a/b?x=1');
    expect(result.ok).toBe(true);
    expect(result.ok && result.findings).toEqual([]);
  });

  it('flags userinfo in the URL', () => {
    const result = inspectUrlSafety('https://paypal.com@evil.example/login');
    expect(result.ok).toBe(true);
    expect(result.ok && result.findings.some((f) => f.id === 'userinfo')).toBe(true);
  });

  it('flags a raw IPv4 host and skips homograph analysis', () => {
    const result = inspectUrlSafety('http://192.168.1.1/admin');
    expect(result.ok).toBe(true);
    expect(result.ok && result.findings.some((f) => f.id === 'ip-literal')).toBe(true);
    expect(result.ok && result.homograph).toBeNull();
  });

  it('flags a bracketed IPv6 host', () => {
    const result = inspectUrlSafety('http://[::1]/');
    expect(result.ok).toBe(true);
    expect(result.ok && result.findings.some((f) => f.id === 'ip-literal')).toBe(true);
  });

  it('flags a mixed-script (homograph) host', () => {
    const result = inspectUrlSafety('https://аpple.com/');
    expect(result.ok).toBe(true);
    expect(result.ok && result.findings.some((f) => f.id === 'mixed-script')).toBe(true);
  });

  it('notes a punycode host without treating it as inherently dangerous', () => {
    const result = inspectUrlSafety('https://xn--mnchen-3ya.de/');
    expect(result.ok).toBe(true);
    const finding = result.ok ? result.findings.find((f) => f.id === 'punycode') : undefined;
    expect(finding?.severity).toBe('info');
    expect(finding?.message).toContain('münchen.de');
  });

  it('flags a commonly-abused TLD as an informational note', () => {
    const result = inspectUrlSafety('https://free-gift-card.top/');
    expect(result.ok).toBe(true);
    const finding = result.ok ? result.findings.find((f) => f.id === 'suspicious-tld') : undefined;
    expect(finding?.severity).toBe('info');
  });

  it('flags an unusually deep subdomain chain', () => {
    const result = inspectUrlSafety('https://real-bank.com.login.security.example.net/');
    expect(result.ok).toBe(true);
    expect(result.ok && result.findings.some((f) => f.id === 'deep-subdomain')).toBe(true);
  });

  it('does not flag a legitimate single-script non-Latin domain', () => {
    const result = inspectUrlSafety('https://яндекс.рф/');
    expect(result.ok).toBe(true);
    expect(result.ok && result.findings.some((f) => f.id === 'mixed-script')).toBe(false);
  });

  it('errors on empty or invalid input', () => {
    expect(inspectUrlSafety('').ok).toBe(false);
    expect(inspectUrlSafety('not a url').ok).toBe(false);
  });
});
