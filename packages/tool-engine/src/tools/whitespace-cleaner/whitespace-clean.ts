export type TabConversion = 'none' | 'tabs-to-spaces' | 'spaces-to-tabs';
export type LineEnding = 'unchanged' | 'lf' | 'crlf' | 'cr';
export type IndentStyle = 'spaces' | 'tabs';

export interface WhitespaceCleanOptions {
  readonly trim: boolean;
  readonly collapseSpaces: boolean;
  readonly lineEnding: LineEnding;
  readonly stripTrailingWhitespace: boolean;
  readonly removeBlankLines: boolean;
  readonly stripInvisibleChars: boolean;
  readonly tabConversion: TabConversion;
  readonly tabWidth: number;
  readonly reindent: boolean;
  readonly reindentFromWidth: number;
  readonly reindentToWidth: number;
  readonly reindentToStyle: IndentStyle;
}

export const DEFAULT_WHITESPACE_OPTIONS: WhitespaceCleanOptions = {
  trim: true,
  collapseSpaces: true,
  lineEnding: 'lf',
  stripTrailingWhitespace: true,
  removeBlankLines: false,
  stripInvisibleChars: false,
  tabConversion: 'none',
  tabWidth: 4,
  reindent: false,
  reindentFromWidth: 4,
  reindentToWidth: 2,
  reindentToStyle: 'spaces',
};

/**
 * Brings a persisted options object (which may predate `lineEnding`/`reindent*`,
 * back when line-ending normalization was the boolean `normalizeLineEndings`)
 * up to the current shape, so an existing user's stored preferences don't
 * leave new fields `undefined`.
 */
export function migrateWhitespaceOptions(stored: unknown): WhitespaceCleanOptions {
  const raw = (stored ?? {}) as Partial<WhitespaceCleanOptions> & { normalizeLineEndings?: boolean };
  const legacyLineEnding: LineEnding | undefined =
    raw.lineEnding === undefined && typeof raw.normalizeLineEndings === 'boolean'
      ? raw.normalizeLineEndings
        ? 'lf'
        : 'unchanged'
      : undefined;

  return {
    ...DEFAULT_WHITESPACE_OPTIONS,
    ...raw,
    lineEnding: raw.lineEnding ?? legacyLineEnding ?? DEFAULT_WHITESPACE_OPTIONS.lineEnding,
  };
}

/** Zero-width space, ZWNJ, ZWJ, BOM/ZWNBSP, soft hyphen, word joiner. */
const INVISIBLE_CHAR_PATTERN = /[​-‍﻿­⁠]/g;

const LINE_ENDING_STRINGS: Record<Exclude<LineEnding, 'unchanged'>, string> = {
  lf: '\n',
  crlf: '\r\n',
  cr: '\r',
};

export function cleanWhitespace(input: string, options: WhitespaceCleanOptions): string {
  let source = input;
  if (options.stripInvisibleChars) {
    source = source.replace(INVISIBLE_CHAR_PATTERN, '');
  }

  // Track each line's own terminator (which may differ line to line in mixed input) separately
  // from its content, so "Unchanged" can restore exactly what was there when nothing else applies.
  const contents = source.split(/\r\n|\r|\n/);
  const terminators = source.match(/\r\n|\r|\n/g) ?? [];
  let lines = contents.map((content, index) => ({ content, terminator: terminators[index] ?? '' }));

  if (options.reindent) {
    lines = lines.map((line) => ({ ...line, content: reindentLine(line.content, options) }));
  }

  if (options.collapseSpaces) {
    lines = lines.map((line) => ({ ...line, content: line.content.replace(/[ \t]+/g, ' ') }));
  }

  const tabWidth = Math.max(1, Math.trunc(options.tabWidth) || 1);
  if (options.tabConversion === 'tabs-to-spaces') {
    lines = lines.map((line) => ({ ...line, content: line.content.replace(/\t/g, ' '.repeat(tabWidth)) }));
  } else if (options.tabConversion === 'spaces-to-tabs') {
    const run = ' '.repeat(tabWidth);
    lines = lines.map((line) => ({ ...line, content: line.content.split(run).join('\t') }));
  }

  if (options.stripTrailingWhitespace) {
    lines = lines.map((line) => ({ ...line, content: line.content.replace(/[ \t]+$/, '') }));
  }

  if (options.removeBlankLines) {
    lines = lines.filter((line) => line.content.trim() !== '');
  }

  // A line with an empty terminator is the final segment after the last real line break (or the
  // only segment, if there were none) -- it never had a terminator, so it must not gain one here.
  const targetTerminator = options.lineEnding === 'unchanged' ? null : LINE_ENDING_STRINGS[options.lineEnding];
  let text = lines
    .map((line) => line.content + (line.terminator === '' ? '' : (targetTerminator ?? line.terminator)))
    .join('');

  if (options.trim) {
    text = text.trim();
  }

  return text;
}

/** Rescales a line's leading indentation from `reindentFromWidth`-space levels to the target width/style. */
function reindentLine(line: string, options: WhitespaceCleanOptions): string {
  const match = /^[ \t]*/.exec(line);
  const leading = match![0];
  if (leading === '') return line;

  const fromWidth = Math.max(1, Math.trunc(options.reindentFromWidth) || 1);
  const tabCount = (leading.match(/\t/g) ?? []).length;
  const spaceCount = leading.length - tabCount;
  const level = tabCount + Math.floor(spaceCount / fromWidth);

  const unit = options.reindentToStyle === 'tabs' ? '\t' : ' '.repeat(Math.max(1, Math.trunc(options.reindentToWidth) || 1));
  return unit.repeat(level) + line.slice(leading.length);
}
