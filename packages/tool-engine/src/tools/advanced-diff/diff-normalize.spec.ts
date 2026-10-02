import { NO_IGNORE_OPTIONS, computeLineDiffIgnoring, hasAnyIgnoreOption, normalizeLine, normalizeWholeText } from "./diff-normalize.js";

describe('hasAnyIgnoreOption', () => {
  it('is false when every option is disabled', () => {
    expect(hasAnyIgnoreOption(NO_IGNORE_OPTIONS)).toBe(false);
  });

  it('is true when any option is enabled', () => {
    expect(hasAnyIgnoreOption({ ...NO_IGNORE_OPTIONS, ignoreCase: true })).toBe(true);
  });
});

describe('normalizeLine', () => {
  it('strips a trailing CR when ignoring line endings', () => {
    expect(normalizeLine('foo\r', { ...NO_IGNORE_OPTIONS, ignoreLineEndings: true })).toBe('foo');
  });

  it('trims and collapses whitespace when ignoring whitespace', () => {
    expect(normalizeLine('  foo   bar  ', { ...NO_IGNORE_OPTIONS, ignoreWhitespace: true })).toBe('foo bar');
  });

  it('lowercases when ignoring case', () => {
    expect(normalizeLine('FooBar', { ...NO_IGNORE_OPTIONS, ignoreCase: true })).toBe('foobar');
  });

  it('leaves the line untouched when every option is disabled', () => {
    expect(normalizeLine('  FooBar\r', NO_IGNORE_OPTIONS)).toBe('  FooBar\r');
  });
});

describe('normalizeWholeText', () => {
  it('normalizes every line independently', () => {
    expect(normalizeWholeText('FOO\nBAR', { ...NO_IGNORE_OPTIONS, ignoreCase: true })).toBe('foo\nbar');
  });
});

describe('computeLineDiffIgnoring', () => {
  it('behaves exactly like computeLineDiff when no options are set', () => {
    const result = computeLineDiffIgnoring('a\nb', 'a\nc', NO_IGNORE_OPTIONS);
    expect(result.lines.map((l) => `${l.type}:${l.text}`)).toEqual(['equal:a', 'remove:b', 'add:c']);
  });

  it('treats differently-cased identical lines as equal when ignoring case', () => {
    const result = computeLineDiffIgnoring('Hello\nWorld', 'hello\nworld', { ...NO_IGNORE_OPTIONS, ignoreCase: true });
    expect(result.summary).toEqual({ added: 0, removed: 0, unchanged: 2 });
  });

  it('displays the ORIGINAL (not normalized) text even when ignore-options are active', () => {
    const result = computeLineDiffIgnoring('Hello\nWorld', 'hello\nWORLD', { ...NO_IGNORE_OPTIONS, ignoreCase: true });
    expect(result.lines.every((l) => l.type === 'equal')).toBe(true);
    expect(result.lines.map((l) => l.text)).toEqual(['Hello', 'World']);
  });

  it('treats whitespace-only differences as equal when ignoring whitespace', () => {
    const result = computeLineDiffIgnoring('foo   bar', 'foo bar', { ...NO_IGNORE_OPTIONS, ignoreWhitespace: true });
    expect(result.summary).toEqual({ added: 0, removed: 0, unchanged: 1 });
  });

  it('treats CRLF vs LF as equal when ignoring line endings', () => {
    const result = computeLineDiffIgnoring('foo\r\nbar', 'foo\nbar', { ...NO_IGNORE_OPTIONS, ignoreLineEndings: true });
    expect(result.summary.unchanged).toBe(2);
  });

  it('handles empty input on either side', () => {
    const result = computeLineDiffIgnoring('', 'a\nb', { ...NO_IGNORE_OPTIONS, ignoreCase: true });
    expect(result.lines.every((l) => l.type === 'add')).toBe(true);
    expect(result.lines.map((l) => l.text)).toEqual(['a', 'b']);
  });
});
