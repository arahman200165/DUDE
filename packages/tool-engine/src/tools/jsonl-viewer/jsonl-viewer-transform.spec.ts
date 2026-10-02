import { parseJsonl } from "./jsonl-viewer-transform.js";

describe('parseJsonl', () => {
  it('parses one JSON value per line into an array', () => {
    const result = parseJsonl('{"a":1}\n{"a":2}\n');

    expect(result.ok).toBe(true);
    expect(result.ok && result.result.records).toEqual([{ a: 1 }, { a: 2 }]);
    expect(result.ok && result.result.arrayOutput).toBe(JSON.stringify([{ a: 1 }, { a: 2 }], null, 2));
  });

  it('skips blank lines', () => {
    const result = parseJsonl('{"a":1}\n\n{"a":2}\n');

    expect(result.ok && result.result.records).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('builds a table with the union of keys across records, in first-seen order', () => {
    const result = parseJsonl('{"a":1,"b":2}\n{"b":3,"c":4}\n');

    expect(result.ok).toBe(true);
    expect(result.ok && result.result.table).toEqual({
      columns: ['a', 'b', 'c'],
      rows: [
        ['1', '2', ''],
        ['', '3', '4'],
      ],
    });
  });

  it('falls back to a single "value" column for non-object records', () => {
    const result = parseJsonl('1\n"two"\ntrue\n');

    expect(result.ok).toBe(true);
    expect(result.ok && result.result.table).toEqual({
      columns: ['value'],
      rows: [['1'], ['"two"'], ['true']],
    });
  });

  it('rejects empty input', () => {
    expect(parseJsonl('').ok).toBe(false);
    expect(parseJsonl('   \n  ').ok).toBe(false);
  });

  it('reports which line failed to parse', () => {
    const result = parseJsonl('{"a":1}\n{"a": }\n');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message.startsWith('Line 2 is invalid JSON')).toBe(true);
  });
});
