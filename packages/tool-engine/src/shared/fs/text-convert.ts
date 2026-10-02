/**
 * Batch Text Converter transforms (Phase 29 items 7 and 8, Milestone 531): line endings, final
 * newline, trailing whitespace, and leading tabs ↔ spaces, plus a per-file inventory of what a
 * folder currently uses. Encoding/BOM changes happen at the byte layer (`apps/desktop/fs-text-io.ts`);
 * this file only ever sees decoded text, so it is pure and shared with the renderer's report.
 */

export type EolStyle = 'lf' | 'crlf' | 'cr';
export type EolReport = EolStyle | 'mixed' | 'none';

export interface ConvertOptions {
  readonly eol: 'keep' | EolStyle;
  /** 'keep', or an iconv-lite encoding name ('utf8', 'utf16le', 'win1252', …). */
  readonly encoding: string;
  readonly bom: 'keep' | 'add' | 'strip';
  readonly finalNewline: 'keep' | 'ensure' | 'strip';
  readonly trimTrailing: boolean;
  readonly indent: 'keep' | 'tabs' | 'spaces';
  readonly indentSize: number;
  /** Resolve every setting per file from the tree's .editorconfig files instead. */
  readonly editorconfig: boolean;
}

export const DEFAULT_CONVERT: ConvertOptions = { eol: 'lf', encoding: 'keep', bom: 'keep', finalNewline: 'keep', trimTrailing: false, indent: 'keep', indentSize: 4, editorconfig: false };

const EOL_TEXT: Readonly<Record<EolStyle, string>> = { lf: '\n', crlf: '\r\n', cr: '\r' };

export function detectEol(text: string): EolReport {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/(?<!\r)\n/g) ?? []).length;
  const cr = (text.match(/\r(?!\n)/g) ?? []).length;
  const kinds = [crlf && 'crlf', lf && 'lf', cr && 'cr'].filter(Boolean) as EolStyle[];
  return kinds.length === 0 ? 'none' : kinds.length > 1 ? 'mixed' : kinds[0];
}

export function detectIndent(text: string): 'tabs' | 'spaces' | 'mixed' | 'none' {
  let tabs = 0;
  let spaces = 0;
  for (const line of text.split(/\r\n|\n|\r/)) {
    if (/^\t/.test(line)) tabs++;
    else if (/^ {2,}\S/.test(line)) spaces++;
  }
  return tabs && spaces ? 'mixed' : tabs ? 'tabs' : spaces ? 'spaces' : 'none';
}

export interface TextInventory {
  readonly eol: EolReport;
  readonly finalNewline: boolean;
  readonly trailingWhitespaceLines: number;
  readonly indent: 'tabs' | 'spaces' | 'mixed' | 'none';
}

export function inventory(text: string): TextInventory {
  return {
    eol: detectEol(text),
    finalNewline: /(\r\n|\n|\r)$/.test(text),
    trailingWhitespaceLines: (text.match(/[ \t]+(?=\r\n|\n|\r|$)/g) ?? []).filter(Boolean).length,
    indent: detectIndent(text),
  };
}

function reindent(line: string, mode: 'tabs' | 'spaces', size: number): string {
  const match = /^[ \t]+/.exec(line);
  if (!match) return line;
  let width = 0;
  for (const char of match[0]) width = char === '\t' ? width + size - (width % size) : width + 1;
  const lead = mode === 'spaces' ? ' '.repeat(width) : '\t'.repeat(Math.floor(width / size)) + ' '.repeat(width % size);
  return lead + line.slice(match[0].length);
}

/** Applies the text-level options; returns the new text and a human list of what changed. */
export function convertText(text: string, options: ConvertOptions): { text: string; changes: string[] } {
  const changes: string[] = [];
  const parts = text.split(/(\r\n|\n|\r)/);
  let lines: string[] = [];
  let eols: string[] = [];
  for (let index = 0; index < parts.length; index += 2) { lines.push(parts[index]); if (index + 1 < parts.length) eols.push(parts[index + 1]); }
  const hadFinal = eols.length === lines.length - 1 && lines[lines.length - 1] === '' && eols.length > 0;
  if (hadFinal) lines = lines.slice(0, -1);

  if (options.indent !== 'keep') {
    const next = lines.map((line) => reindent(line, options.indent as 'tabs' | 'spaces', Math.max(1, options.indentSize)));
    if (next.some((line, index) => line !== lines[index])) changes.push(options.indent === 'spaces' ? `tabs → ${options.indentSize} spaces` : 'spaces → tabs');
    lines = next;
  }
  if (options.trimTrailing) {
    const next = lines.map((line) => line.replace(/[ \t]+$/, ''));
    const trimmed = next.filter((line, index) => line !== lines[index]).length;
    if (trimmed) changes.push(`trimmed ${trimmed} line(s)`);
    lines = next;
  }
  if (options.eol !== 'keep') {
    const target = EOL_TEXT[options.eol];
    const before = detectEol(text);
    if (eols.some((eol) => eol !== target)) changes.push(`${before.toUpperCase()} → ${options.eol.toUpperCase()}`);
    eols = eols.map(() => target);
  }
  const dominant = options.eol !== 'keep' ? EOL_TEXT[options.eol] : eols[0] ?? '\n';
  let final = hadFinal;
  if (options.finalNewline === 'ensure' && !hadFinal && lines.some((line) => line !== '')) { final = true; changes.push('added final newline'); }
  if (options.finalNewline === 'strip' && hadFinal) {
    final = false;
    changes.push('removed final newline');
    // Also drop trailing blank lines so "strip" leaves the file ending on content.
    while (lines.length > 1 && lines[lines.length - 1] === '') { lines.pop(); eols.pop(); }
  }
  let out = '';
  for (let index = 0; index < lines.length; index++) {
    out += lines[index];
    if (index < lines.length - 1) out += eols[index] ?? dominant;
  }
  if (final) out += hadFinal ? (eols[lines.length - 1] ?? dominant) : dominant;
  return { text: out, changes };
}
