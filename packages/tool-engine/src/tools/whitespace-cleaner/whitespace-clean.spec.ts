import { WhitespaceCleanOptions, cleanWhitespace, migrateWhitespaceOptions } from "./whitespace-clean.js";

const NONE: WhitespaceCleanOptions = {
  trim: false,
  collapseSpaces: false,
  lineEnding: 'unchanged',
  stripTrailingWhitespace: false,
  removeBlankLines: false,
  stripInvisibleChars: false,
  tabConversion: 'none',
  tabWidth: 4,
  reindent: false,
  reindentFromWidth: 4,
  reindentToWidth: 2,
  reindentToStyle: 'spaces',
};

describe('cleanWhitespace', () => {
  it('returns the input unchanged when every option is disabled', () => {
    expect(cleanWhitespace('  a  \r\n\tb\t \n', NONE)).toBe('  a  \r\n\tb\t \n');
  });

  it('trims leading and trailing whitespace of the whole text', () => {
    expect(cleanWhitespace('  hello  ', { ...NONE, trim: true })).toBe('hello');
  });

  it('collapses repeated spaces and tabs within a line', () => {
    expect(cleanWhitespace('a    b\t\tc', { ...NONE, collapseSpaces: true })).toBe('a b c');
  });

  it('normalizes CRLF and lone CR to LF', () => {
    expect(cleanWhitespace('a\r\nb\rc\nd', { ...NONE, lineEnding: 'lf' })).toBe('a\nb\nc\nd');
  });

  it('converts LF to CRLF', () => {
    expect(cleanWhitespace('a\nb\nc', { ...NONE, lineEnding: 'crlf' })).toBe('a\r\nb\r\nc');
  });

  it('converts LF to lone CR', () => {
    expect(cleanWhitespace('a\nb', { ...NONE, lineEnding: 'cr' })).toBe('a\rb');
  });

  it('preserves each line\'s original (possibly mixed) ending when unchanged', () => {
    expect(cleanWhitespace('a\r\nb\rc\n', { ...NONE, lineEnding: 'unchanged' })).toBe('a\r\nb\rc\n');
  });

  it('strips trailing whitespace per line', () => {
    expect(cleanWhitespace('a  \nb\t\nc', { ...NONE, stripTrailingWhitespace: true })).toBe('a\nb\nc');
  });

  it('removes blank lines', () => {
    expect(cleanWhitespace('a\n\n  \nb', { ...NONE, removeBlankLines: true })).toBe('a\nb');
  });

  it('strips zero-width and invisible characters', () => {
    expect(cleanWhitespace('a​b﻿c', { ...NONE, stripInvisibleChars: true })).toBe('abc');
  });

  it('converts tabs to spaces using the configured width', () => {
    expect(cleanWhitespace('a\tb', { ...NONE, tabConversion: 'tabs-to-spaces', tabWidth: 2 })).toBe('a  b');
  });

  it('converts runs of spaces to tabs using the configured width', () => {
    expect(cleanWhitespace('a  b', { ...NONE, tabConversion: 'spaces-to-tabs', tabWidth: 2 })).toBe('a\tb');
  });

  it('reindents 4-space indentation to 2-space', () => {
    const input = 'a\n    b\n        c';
    const result = cleanWhitespace(input, { ...NONE, reindent: true, reindentFromWidth: 4, reindentToWidth: 2, reindentToStyle: 'spaces' });
    expect(result).toBe('a\n  b\n    c');
  });

  it('reindents space indentation to tabs', () => {
    const input = '    a\n        b';
    const result = cleanWhitespace(input, { ...NONE, reindent: true, reindentFromWidth: 4, reindentToStyle: 'tabs' });
    expect(result).toBe('\ta\n\t\tb');
  });

  it('reindents tab indentation to spaces, counting each tab as one level', () => {
    const input = '\ta\n\t\tb';
    const result = cleanWhitespace(input, { ...NONE, reindent: true, reindentToWidth: 2, reindentToStyle: 'spaces' });
    expect(result).toBe('  a\n    b');
  });

  it('leaves lines with no leading whitespace untouched by reindent', () => {
    expect(cleanWhitespace('a\nb', { ...NONE, reindent: true })).toBe('a\nb');
  });

  it('applies multiple operations together', () => {
    const result = cleanWhitespace('  foo   bar  \r\n\r\n  baz  \n', {
      ...NONE,
      trim: true,
      collapseSpaces: true,
      lineEnding: 'lf',
      stripTrailingWhitespace: true,
      removeBlankLines: true,
    });
    expect(result).toBe('foo bar\n baz');
  });

  it('handles empty input', () => {
    expect(cleanWhitespace('', { ...NONE, trim: true, collapseSpaces: true })).toBe('');
  });
});

describe('migrateWhitespaceOptions', () => {
  it('maps a legacy normalizeLineEndings: true to lineEnding: lf', () => {
    const migrated = migrateWhitespaceOptions({ normalizeLineEndings: true });
    expect(migrated.lineEnding).toBe('lf');
  });

  it('maps a legacy normalizeLineEndings: false to lineEnding: unchanged', () => {
    const migrated = migrateWhitespaceOptions({ normalizeLineEndings: false });
    expect(migrated.lineEnding).toBe('unchanged');
  });

  it('leaves an already-current options object untouched', () => {
    const current: WhitespaceCleanOptions = { ...NONE, lineEnding: 'crlf' };
    expect(migrateWhitespaceOptions(current)).toEqual(current);
  });

  it('backfills missing reindent fields with defaults', () => {
    const migrated = migrateWhitespaceOptions({ trim: true });
    expect(migrated.reindent).toBe(false);
    expect(migrated.reindentFromWidth).toBeGreaterThan(0);
  });

  it('handles null/undefined stored values', () => {
    expect(migrateWhitespaceOptions(undefined).lineEnding).toBe('lf');
    expect(migrateWhitespaceOptions(null).lineEnding).toBe('lf');
  });
});
