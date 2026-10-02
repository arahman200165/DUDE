import { generateCuids, isValidCuid } from "./cuid-logic.js";

describe('generateCuids', () => {
  it('generates the requested count at the default length', () => {
    const result = generateCuids(5, 24);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values).toHaveLength(5);
    expect(result.values[0]).toHaveLength(24);
    expect(isValidCuid(result.values[0])).toBe(true);
  });

  it('generates distinct values', () => {
    const result = generateCuids(10, 24);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(new Set(result.values).size).toBe(10);
  });

  it('honors a custom length', () => {
    const result = generateCuids(1, 10);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.values[0]).toHaveLength(10);
  });

  it('rejects a count outside the valid range', () => {
    expect(generateCuids(0, 24).ok).toBe(false);
    expect(generateCuids(1001, 24).ok).toBe(false);
  });

  it('rejects a length outside the valid range', () => {
    expect(generateCuids(1, 1).ok).toBe(false);
    expect(generateCuids(1, 33).ok).toBe(false);
  });
});

describe('isValidCuid', () => {
  it('rejects an obviously invalid value', () => {
    expect(isValidCuid('not-a-cuid!')).toBe(false);
  });
});
