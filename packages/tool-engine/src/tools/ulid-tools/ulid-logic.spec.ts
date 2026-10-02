import { generateUlid, inspectUlid } from "./ulid-logic.js";

describe('generateUlid', () => {
  it('generates a syntactically valid ULID', () => {
    const value = generateUlid(false);
    expect(value).toHaveLength(26);
    expect(inspectUlid(value).valid).toBe(true);
  });

  it('generates monotonically increasing values in monotonic mode', () => {
    const first = generateUlid(true);
    const second = generateUlid(true);
    expect(second >= first).toBe(true);
  });
});

describe('inspectUlid', () => {
  it('decodes the embedded timestamp to roughly the current time', () => {
    const result = inspectUlid(generateUlid(false));
    expect(result.valid).toBe(true);
    expect(Math.abs((result.timestamp as Date).getTime() - Date.now())).toBeLessThan(5000);
  });

  it('is case-insensitive and trims whitespace', () => {
    const value = generateUlid(false);
    expect(inspectUlid(`  ${value.toLowerCase()}  `).valid).toBe(true);
  });

  it('rejects malformed input', () => {
    expect(inspectUlid('not-a-ulid')).toEqual({ valid: false });
  });

  it('rejects empty input', () => {
    expect(inspectUlid('')).toEqual({ valid: false });
  });
});
