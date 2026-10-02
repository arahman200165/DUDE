import { parseUserAgent } from "./ua-parse.js";

const DESKTOP_CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';
const MOBILE_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

describe('parseUserAgent', () => {
  it('returns an error for blank input', () => {
    expect(parseUserAgent('')).toEqual({ ok: false, error: 'Enter a User-Agent string.' });
    expect(parseUserAgent('   ')).toEqual({ ok: false, error: 'Enter a User-Agent string.' });
  });

  it('parses a desktop Chrome UA into browser, engine, and OS details', () => {
    const result = parseUserAgent(DESKTOP_CHROME_UA);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.parsed.browser).toEqual({ name: 'Chrome', version: '119.0.0.0' });
    expect(result.parsed.engine.name).toBe('Blink');
    expect(result.parsed.os).toEqual({ name: 'Windows', version: '10' });
  });

  it('parses a mobile Safari UA with device fields populated', () => {
    const result = parseUserAgent(MOBILE_SAFARI_UA);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.parsed.device).toEqual({ type: 'mobile', vendor: 'Apple', model: 'iPhone' });
    expect(result.parsed.os.name).toBe('iOS');
  });

  it('returns ok:true with mostly-undefined fields for a nonsense string, not an error', () => {
    const result = parseUserAgent('nonsense-not-a-real-ua');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.parsed.browser.name).toBeUndefined();
    expect(result.parsed.os.name).toBeUndefined();
  });
});
