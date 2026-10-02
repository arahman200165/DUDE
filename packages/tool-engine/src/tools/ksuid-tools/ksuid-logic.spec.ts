import { generateKsuid, inspectKsuid } from "./ksuid-logic.js";

describe('generateKsuid', () => {
  it('generates a 27-character base62 string', () => {
    const value = generateKsuid();
    expect(value).toHaveLength(27);
    expect(value).toMatch(/^[0-9A-Za-z]{27}$/);
  });

  it('generates distinct values on repeated calls', () => {
    expect(generateKsuid()).not.toEqual(generateKsuid());
  });
});

describe('inspectKsuid', () => {
  it('round-trips a freshly generated KSUID to roughly the current time', () => {
    const value = generateKsuid();
    const result = inspectKsuid(value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Math.abs(result.value.timestamp.getTime() - Date.now())).toBeLessThan(2000);
    expect(result.value.payloadHex).toHaveLength(32);
  });

  it('decodes a specific timestamp back correctly', () => {
    const timestampMs = Date.parse('2020-01-01T00:00:00Z');
    const value = generateKsuid(timestampMs);
    const result = inspectKsuid(value);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.timestamp.getTime()).toBe(timestampMs - (timestampMs % 1000));
  });

  it('rejects input of the wrong length', () => {
    expect(inspectKsuid('too-short').ok).toBe(false);
  });

  it('rejects empty input', () => {
    expect(inspectKsuid('').ok).toBe(false);
  });
});
