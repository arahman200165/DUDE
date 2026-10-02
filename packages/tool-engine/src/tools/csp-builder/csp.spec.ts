import { buildCsp, checkCspWarnings, parseCsp } from "./csp.js";

describe('parseCsp', () => {
  it('parses directives with space-separated source values', () => {
    expect(parseCsp("default-src 'self'; script-src 'self' https://cdn.example.com")).toEqual([
      { name: 'default-src', values: ["'self'"] },
      { name: 'script-src', values: ["'self'", 'https://cdn.example.com'] },
    ]);
  });

  it('parses a boolean directive with no values', () => {
    expect(parseCsp('upgrade-insecure-requests')).toEqual([{ name: 'upgrade-insecure-requests', values: [] }]);
  });

  it('returns an empty array for empty input', () => {
    expect(parseCsp('')).toEqual([]);
  });
});

describe('buildCsp', () => {
  it('round-trips through parseCsp', () => {
    const original = "default-src 'self'; script-src 'self' https://cdn.example.com; upgrade-insecure-requests";
    expect(buildCsp(parseCsp(original))).toBe(original);
  });

  it('omits a trailing space for a directive with no values', () => {
    expect(buildCsp([{ name: 'block-all-mixed-content', values: [] }])).toBe('block-all-mixed-content');
  });
});

describe('checkCspWarnings', () => {
  it("flags 'unsafe-inline' in script-src", () => {
    const warnings = checkCspWarnings([{ name: 'script-src', values: ["'unsafe-inline'"] }]);
    expect(warnings.some((w) => w.includes('unsafe-inline'))).toBe(true);
  });

  it("flags 'unsafe-eval' in default-src", () => {
    const warnings = checkCspWarnings([{ name: 'default-src', values: ["'unsafe-eval'"] }]);
    expect(warnings.some((w) => w.includes('unsafe-eval'))).toBe(true);
  });

  it('flags a wildcard source in script-src', () => {
    const warnings = checkCspWarnings([{ name: 'script-src', values: ['*'] }]);
    expect(warnings.some((w) => w.includes("includes '*'"))).toBe(true);
  });

  it('does not flag unsafe-inline in an unrelated directive', () => {
    const warnings = checkCspWarnings([{ name: 'style-src', values: ["'unsafe-inline'"] }]);
    expect(warnings).toEqual([]);
  });

  it('returns no warnings for a strict policy', () => {
    expect(checkCspWarnings([{ name: 'script-src', values: ["'self'"] }])).toEqual([]);
  });
});
