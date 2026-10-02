import { RANDOM_DATA_FIELDS, findField, generateRows } from "./random-data-fields.js";

describe('RANDOM_DATA_FIELDS', () => {
  it('has unique keys', () => {
    const keys = RANDOM_DATA_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every field generates a non-empty string', () => {
    for (const field of RANDOM_DATA_FIELDS) {
      expect(typeof field.generate()).toBe('string');
      expect(field.generate().length).toBeGreaterThan(0);
    }
  });
});

describe('findField', () => {
  it('finds a field by key', () => {
    expect(findField('uuid')?.label).toBe('UUID');
  });

  it('returns undefined for an unknown key', () => {
    expect(findField('not-a-field')).toBeUndefined();
  });
});

describe('generateRows', () => {
  it('generates the requested number of rows with matching columns', () => {
    const result = generateRows({ fieldKeys: ['fullName', 'email'], rowCount: 5 });
    expect(result.ok).toBe(true);
    expect(result.ok && result.columns).toEqual(['Full Name', 'Email']);
    expect(result.ok && result.rows).toHaveLength(5);
    expect(result.ok && result.rows[0]).toHaveLength(2);
  });

  it('produces identical output for the same seed', () => {
    const a = generateRows({ fieldKeys: ['fullName', 'uuid'], rowCount: 3, seed: 42 });
    const b = generateRows({ fieldKeys: ['fullName', 'uuid'], rowCount: 3, seed: 42 });
    expect(a).toEqual(b);
  });

  it('reports an error when no fields are selected', () => {
    expect(generateRows({ fieldKeys: [], rowCount: 5 }).ok).toBe(false);
  });

  it('reports an error for a row count outside the allowed range', () => {
    expect(generateRows({ fieldKeys: ['uuid'], rowCount: 0 }).ok).toBe(false);
    expect(generateRows({ fieldKeys: ['uuid'], rowCount: 1001 }).ok).toBe(false);
  });

  it('reports an error for an unknown field key', () => {
    const result = generateRows({ fieldKeys: ['not-a-field'], rowCount: 1 });
    expect(result.ok).toBe(false);
    expect(result.ok || result.error).toContain('not-a-field');
  });
});
