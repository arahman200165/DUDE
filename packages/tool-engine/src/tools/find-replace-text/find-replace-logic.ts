export interface FindReplaceOptions {
  readonly caseSensitive: boolean;
  readonly wholeWord: boolean;
}

export interface FindReplaceResult {
  readonly output: string;
  readonly matchCount: number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildPattern(find: string, options: FindReplaceOptions): RegExp {
  const escaped = escapeRegExp(find);
  const body = options.wholeWord ? `\\b${escaped}\\b` : escaped;
  return new RegExp(body, options.caseSensitive ? 'g' : 'gi');
}

/** Literal (non-regex) find/replace, with case-sensitivity and whole-word matching options. */
export function findReplace(text: string, find: string, replace: string, options: FindReplaceOptions): FindReplaceResult {
  if (find === '') return { output: text, matchCount: 0 };

  const pattern = buildPattern(find, options);
  const matches = text.match(pattern);
  const output = text.replace(pattern, replace.replace(/\$/g, '$$$$'));

  return { output, matchCount: matches?.length ?? 0 };
}
