/**
 * Line-oriented text search and replace for Tree Search (Phase 29 item 18, Milestone 529) and the
 * Large-File Streaming Inspector. Matches are found per line (like grep/ripgrep), identified by
 * `line:column` so a replace preview can include or exclude each hunk individually. In regex mode
 * the replacement understands `$&`, `$1`…`$99`, `$<name>` and `$$`; in literal mode it is literal.
 */

export interface SearchQuery {
  readonly pattern: string;
  readonly regex: boolean;
  readonly caseSensitive: boolean;
  readonly wholeWord: boolean;
}

export interface LineMatch {
  /** 1-based line number. */
  readonly line: number;
  /** 0-based UTF-16 column of the match start within the full line. */
  readonly column: number;
  readonly length: number;
  /** The line (clipped to about 400 characters around the match). */
  readonly text: string;
  /** Column of the match within `text` (differs from `column` when the line was clipped). */
  readonly textColumn: number;
  readonly before: readonly string[];
  readonly after: readonly string[];
}

const MAX_SHOWN = 400;

function escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** Throws a readable error for an invalid regex. Always global + unicode. */
export function compileQuery(query: SearchQuery): RegExp {
  if (!query.pattern) throw new Error('Enter something to search for.');
  let source = query.regex ? query.pattern : escapeRegex(query.pattern);
  if (query.wholeWord) source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`;
  try {
    return new RegExp(source, `gu${query.caseSensitive ? '' : 'i'}`);
  } catch (error) {
    throw new Error(`Invalid pattern: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function clip(line: string, column: number): { text: string; textColumn: number } {
  if (line.length <= MAX_SHOWN) return { text: line, textColumn: column };
  const start = Math.max(0, Math.min(column - 120, line.length - MAX_SHOWN));
  const prefix = start > 0 ? '…' : '';
  const text = prefix + line.slice(start, start + MAX_SHOWN) + (start + MAX_SHOWN < line.length ? '…' : '');
  return { text, textColumn: column - start + prefix.length };
}

const shortLine = (line: string) => (line.length > MAX_SHOWN ? `${line.slice(0, MAX_SHOWN)}…` : line);

export function searchLines(lines: readonly string[], regex: RegExp, context: number, maxMatches: number): { matches: LineMatch[]; total: number } {
  const matches: LineMatch[] = [];
  let total = 0;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    regex.lastIndex = 0;
    for (let match = regex.exec(line); match; match = regex.exec(line)) {
      if (match[0].length === 0) { regex.lastIndex++; if (regex.lastIndex > line.length) break; continue; }
      total++;
      if (matches.length < maxMatches) {
        const { text, textColumn } = clip(line, match.index);
        matches.push({
          line: index + 1, column: match.index, length: match[0].length, text, textColumn,
          before: lines.slice(Math.max(0, index - context), index).map(shortLine),
          after: lines.slice(index + 1, index + 1 + context).map(shortLine),
        });
      }
    }
  }
  return { matches, total };
}

/** Expands `$&`, `$1`…`$99`, `$<name>` and `$$` like String.prototype.replace. */
export function expandReplacement(template: string, match: RegExpExecArray): string {
  return template.replace(/\$(\$|&|<([^>]*)>|(\d{1,2}))/g, (whole, token: string, name: string | undefined, digits: string | undefined) => {
    if (token === '$') return '$';
    if (token === '&') return match[0];
    if (name !== undefined) return match.groups?.[name] ?? '';
    if (digits !== undefined) {
      const index = Number(digits);
      if (index > 0 && index < match.length) return match[index] ?? '';
      if (digits.length === 2 && Number(digits[0]) > 0 && Number(digits[0]) < match.length) return (match[Number(digits[0])] ?? '') + digits[1];
      return whole;
    }
    return whole;
  });
}

export interface LineReplaceResult {
  readonly lines: string[];
  readonly replaced: number;
  readonly samples: { readonly line: number; readonly before: string; readonly after: string }[];
}

/**
 * Replaces matches line by line, skipping any `line:column` id in `skip`. Match positions are the
 * same ones `searchLines` reports, so what the preview listed is exactly what gets replaced.
 */
export function replaceLines(lines: readonly string[], regex: RegExp, replacement: string, literal: boolean, skip: ReadonlySet<string> = new Set(), maxSamples = 5): LineReplaceResult {
  let replaced = 0;
  const samples: { line: number; before: string; after: string }[] = [];
  const out = lines.map((line, index) => {
    regex.lastIndex = 0;
    let result = '';
    let last = 0;
    let changed = false;
    for (let match = regex.exec(line); match; match = regex.exec(line)) {
      if (match[0].length === 0) { regex.lastIndex++; if (regex.lastIndex > line.length) break; continue; }
      if (skip.has(`${index + 1}:${match.index}`)) continue;
      result += line.slice(last, match.index) + (literal ? replacement : expandReplacement(replacement, match));
      last = match.index + match[0].length;
      replaced++;
      changed = true;
    }
    if (!changed) return line;
    const next = result + line.slice(last);
    if (samples.length < maxSamples) samples.push({ line: index + 1, before: shortLine(line), after: shortLine(next) });
    return next;
  });
  return { lines: out, replaced, samples };
}
