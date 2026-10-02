import { extractColumns, parseColumnSpec, resolveDelimiter } from "./extract-columns-logic.js";

describe('resolveDelimiter', () => {
  it('expands \\t to a real tab', () => {
    expect(resolveDelimiter('\\t')).toBe('\t');
  });

  it('leaves a literal character delimiter unchanged', () => {
    expect(resolveDelimiter(',')).toBe(',');
  });
});

describe('parseColumnSpec', () => {
  it('parses a simple comma list', () => {
    expect(parseColumnSpec('1,3')).toEqual([1, 3]);
  });

  it('expands a range', () => {
    expect(parseColumnSpec('1-3')).toEqual([1, 2, 3]);
  });

  it('expands a descending range', () => {
    expect(parseColumnSpec('3-1')).toEqual([3, 2, 1]);
  });

  it('combines ranges and single columns in order', () => {
    expect(parseColumnSpec('2,4-5,1')).toEqual([2, 4, 5, 1]);
  });

  it('ignores whitespace and empty segments', () => {
    expect(parseColumnSpec(' 1 , , 2 ')).toEqual([1, 2]);
  });

  it('returns an empty list for blank input', () => {
    expect(parseColumnSpec('')).toEqual([]);
  });
});

describe('extractColumns', () => {
  it('extracts and reorders selected columns', () => {
    const result = extractColumns('a,b,c\nd,e,f', { delimiter: ',', columnSpec: '3,1', outputDelimiter: ',' });
    expect(result).toBe('c,a\nf,d');
  });

  it('supports a tab delimiter typed as \\t', () => {
    const result = extractColumns('a\tb\tc', { delimiter: '\\t', columnSpec: '2', outputDelimiter: ',' });
    expect(result).toBe('b');
  });

  it('fills missing columns with an empty string', () => {
    const result = extractColumns('a,b', { delimiter: ',', columnSpec: '1,5', outputDelimiter: '|' });
    expect(result).toBe('a|');
  });

  it('supports a range selector', () => {
    const result = extractColumns('a,b,c,d', { delimiter: ',', columnSpec: '2-3', outputDelimiter: '-' });
    expect(result).toBe('b-c');
  });

  it('returns the input unchanged when no columns are specified', () => {
    expect(extractColumns('a,b,c', { delimiter: ',', columnSpec: '', outputDelimiter: ',' })).toBe('a,b,c');
  });
});
