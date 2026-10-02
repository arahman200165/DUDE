import {
  addLineNumbers,
  addPrefixSuffix,
  applyPerLineTransform,
  removeLineNumbers,
} from "./line-prefix-numbering-logic.js";

describe('addPrefixSuffix', () => {
  it('adds a prefix to every line', () => {
    expect(addPrefixSuffix('a\nb', '> ', '')).toBe('> a\n> b');
  });

  it('adds a suffix to every line', () => {
    expect(addPrefixSuffix('a\nb', '', ',')).toBe('a,\nb,');
  });

  it('adds both a prefix and a suffix', () => {
    expect(addPrefixSuffix('a\nb', '[', ']')).toBe('[a]\n[b]');
  });
});

describe('addLineNumbers', () => {
  it('numbers lines starting from the given value', () => {
    expect(addLineNumbers('a\nb\nc', { start: 1, padded: false, separator: '. ' })).toBe('1. a\n2. b\n3. c');
  });

  it('supports a custom start value', () => {
    expect(addLineNumbers('a\nb', { start: 10, padded: false, separator: ': ' })).toBe('10: a\n11: b');
  });

  it('pads numbers to a consistent width when requested', () => {
    const lines = Array.from({ length: 11 }, (_, i) => `line${i}`).join('\n');
    const result = addLineNumbers(lines, { start: 1, padded: true, separator: ' ' });
    expect(result.split('\n')[0]).toBe('01 line0');
    expect(result.split('\n')[10]).toBe('11 line10');
  });
});

describe('removeLineNumbers', () => {
  it('strips a "N. " prefix', () => {
    expect(removeLineNumbers('1. a\n2. b')).toBe('a\nb');
  });

  it('strips a "N: " prefix', () => {
    expect(removeLineNumbers('1: a\n2: b')).toBe('a\nb');
  });

  it('strips a "N) " prefix', () => {
    expect(removeLineNumbers('1) a\n2) b')).toBe('a\nb');
  });

  it('strips a bare "N " prefix', () => {
    expect(removeLineNumbers('1 a\n2 b')).toBe('a\nb');
  });

  it('leaves lines with no leading number untouched', () => {
    expect(removeLineNumbers('hello\nworld')).toBe('hello\nworld');
  });
});

describe('applyPerLineTransform', () => {
  it('uppercases every line', () => {
    expect(applyPerLineTransform('a\nb', 'uppercase')).toBe('A\nB');
  });

  it('lowercases every line', () => {
    expect(applyPerLineTransform('A\nB', 'lowercase')).toBe('a\nb');
  });

  it('trims every line', () => {
    expect(applyPerLineTransform('  a  \n  b  ', 'trim')).toBe('a\nb');
  });

  it('wraps every line in double quotes', () => {
    expect(applyPerLineTransform('a\nb', 'wrap-quotes')).toBe('"a"\n"b"');
  });

  it('applies a literal find-replace per line', () => {
    expect(applyPerLineTransform('foo bar\nfoo baz', 'find-replace', { find: 'foo', replace: 'qux' })).toBe(
      'qux bar\nqux baz',
    );
  });

  it('leaves lines unchanged when find is empty', () => {
    expect(applyPerLineTransform('a\nb', 'find-replace', { find: '', replace: 'x' })).toBe('a\nb');
  });
});
