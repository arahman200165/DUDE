import { EMPTY_CORS, buildCorsHeaderText, evaluatePreflight, parseCorsHeaderText } from "./cors-headers.js";

describe('parseCorsHeaderText', () => {
  it('parses every CORS response header', () => {
    const raw = [
      'Access-Control-Allow-Origin: https://app.example.com',
      'Access-Control-Allow-Methods: GET, POST',
      'Access-Control-Allow-Headers: Content-Type, Authorization',
      'Access-Control-Allow-Credentials: true',
      'Access-Control-Max-Age: 600',
      'Access-Control-Expose-Headers: X-Request-Id',
    ].join('\n');
    expect(parseCorsHeaderText(raw)).toEqual({
      allowOrigin: 'https://app.example.com',
      allowMethods: 'GET, POST',
      allowHeaders: 'Content-Type, Authorization',
      allowCredentials: true,
      maxAge: '600',
      exposeHeaders: 'X-Request-Id',
    });
  });

  it('is case-insensitive for header names', () => {
    expect(parseCorsHeaderText('access-control-allow-origin: *').allowOrigin).toBe('*');
  });

  it('returns EMPTY_CORS for empty input', () => {
    expect(parseCorsHeaderText('')).toEqual(EMPTY_CORS);
  });
});

describe('buildCorsHeaderText', () => {
  it('round-trips through parseCorsHeaderText', () => {
    const original = { ...EMPTY_CORS, allowOrigin: '*', allowMethods: 'GET, POST', allowCredentials: false, maxAge: '600' };
    expect(parseCorsHeaderText(buildCorsHeaderText(original))).toEqual(original);
  });

  it('omits headers with no value', () => {
    expect(buildCorsHeaderText({ ...EMPTY_CORS, allowOrigin: '*' })).toBe('Access-Control-Allow-Origin: *');
  });
});

describe('evaluatePreflight', () => {
  const permissive = { ...EMPTY_CORS, allowOrigin: '*', allowMethods: 'GET, POST', allowHeaders: 'Content-Type' };

  it('allows a request matching every constraint', () => {
    const result = evaluatePreflight(permissive, { origin: 'https://app.example.com', method: 'GET', headers: 'Content-Type' });
    expect(result).toEqual({ allowed: true, reasons: [] });
  });

  it('rejects a disallowed origin', () => {
    const cors = { ...EMPTY_CORS, allowOrigin: 'https://trusted.example.com' };
    const result = evaluatePreflight(cors, { origin: 'https://evil.example.com', method: '', headers: '' });
    expect(result.allowed).toBe(false);
    expect(result.reasons.some((r) => r.includes('not allowed by Access-Control-Allow-Origin'))).toBe(true);
  });

  it('rejects Allow-Credentials combined with a wildcard origin', () => {
    const cors = { ...EMPTY_CORS, allowOrigin: '*', allowCredentials: true };
    const result = evaluatePreflight(cors, { origin: 'https://app.example.com', method: '', headers: '' });
    expect(result.reasons.some((r) => r.includes('cannot be combined with a wildcard'))).toBe(true);
  });

  it('rejects a disallowed method', () => {
    const cors = { ...EMPTY_CORS, allowOrigin: '*', allowMethods: 'GET' };
    const result = evaluatePreflight(cors, { origin: 'https://app.example.com', method: 'DELETE', headers: '' });
    expect(result.reasons.some((r) => r.includes('Method "DELETE"'))).toBe(true);
  });

  it('rejects a disallowed request header', () => {
    const cors = { ...EMPTY_CORS, allowOrigin: '*', allowHeaders: 'Content-Type' };
    const result = evaluatePreflight(cors, { origin: 'https://app.example.com', method: '', headers: 'Content-Type, X-Custom' });
    expect(result.reasons.some((r) => r.includes('x-custom'))).toBe(true);
  });
});
