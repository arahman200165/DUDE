import { generateNanoIds } from "./nanoid-logic.js";

describe('generateNanoIds', () => {
  it('generates the requested count at the default length', () => {
    const result = generateNanoIds(5, 21, '');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values).toHaveLength(5);
    expect(result.values[0]).toHaveLength(21);
  });

  it('generates distinct values', () => {
    const result = generateNanoIds(10, 21, '');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(new Set(result.values).size).toBe(10);
  });

  it('honors a custom size', () => {
    const result = generateNanoIds(1, 8, '');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.values[0]).toHaveLength(8);
  });

  it('honors a custom alphabet', () => {
    const result = generateNanoIds(20, 10, '01');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const value of result.values) {
      expect(value).toMatch(/^[01]{10}$/);
    }
  });

  it('rejects a count outside the valid range', () => {
    expect(generateNanoIds(0, 21, '').ok).toBe(false);
    expect(generateNanoIds(1001, 21, '').ok).toBe(false);
  });

  it('rejects a size outside the valid range', () => {
    expect(generateNanoIds(1, 0, '').ok).toBe(false);
    expect(generateNanoIds(1, 513, '').ok).toBe(false);
  });

  it('rejects a custom alphabet with fewer than 2 distinct characters', () => {
    expect(generateNanoIds(1, 5, 'aaaa').ok).toBe(false);
  });
});
