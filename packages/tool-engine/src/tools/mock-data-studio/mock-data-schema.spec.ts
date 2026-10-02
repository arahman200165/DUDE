import { generateMockData, parseSchema } from "./mock-data-schema.js";

describe('parseSchema', () => {
  it('parses a valid flat schema', () => {
    const result = parseSchema('{"name": "person.fullName", "email": "internet.email"}');
    expect(result).toEqual({ ok: true, schema: { name: 'person.fullName', email: 'internet.email' } });
  });

  it('rejects invalid JSON', () => {
    expect(parseSchema('not json').ok).toBe(false);
  });

  it('rejects a JSON array', () => {
    expect(parseSchema('[1, 2, 3]').ok).toBe(false);
  });

  it('rejects an empty schema', () => {
    expect(parseSchema('{}').ok).toBe(false);
  });

  it('rejects a non-string field mapping', () => {
    expect(parseSchema('{"name": 42}').ok).toBe(false);
  });

  it('rejects empty input', () => {
    expect(parseSchema('').ok).toBe(false);
  });
});

describe('generateMockData', () => {
  it('generates the requested number of rows with the mapped fields', () => {
    const result = generateMockData({ name: 'person.fullName', email: 'internet.email' }, { rowCount: 5 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(5);
    for (const row of result.rows) {
      expect(typeof row['name']).toBe('string');
      expect(typeof row['email']).toBe('string');
    }
  });

  it('is deterministic when a seed is given', () => {
    const schema = { name: 'person.fullName' };
    const first = generateMockData(schema, { rowCount: 3, seed: 42 });
    const second = generateMockData(schema, { rowCount: 3, seed: 42 });
    expect(first).toEqual(second);
  });

  it('rejects an unknown faker path', () => {
    const result = generateMockData({ name: 'not.a.real.path' }, { rowCount: 1 });
    expect(result.ok).toBe(false);
  });

  it('rejects a non-dotted path', () => {
    const result = generateMockData({ name: 'fullName' }, { rowCount: 1 });
    expect(result.ok).toBe(false);
  });

  it('rejects a path pointing at a non-function', () => {
    const result = generateMockData({ name: 'person.zodiacSign.length' }, { rowCount: 1 });
    expect(result.ok).toBe(false);
  });

  it('rejects a row count outside the valid range', () => {
    expect(generateMockData({ name: 'person.fullName' }, { rowCount: 0 }).ok).toBe(false);
    expect(generateMockData({ name: 'person.fullName' }, { rowCount: 1001 }).ok).toBe(false);
  });

  it('rejects an empty schema', () => {
    expect(generateMockData({}, { rowCount: 1 }).ok).toBe(false);
  });
});
