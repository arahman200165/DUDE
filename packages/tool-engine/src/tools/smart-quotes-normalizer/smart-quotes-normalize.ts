export type Direction = 'to-straight' | 'to-curly';

export interface SmartQuotesOptions {
  readonly direction: Direction;
  readonly quotes: boolean;
  readonly dashes: boolean;
  readonly ellipsis: boolean;
}

export const DEFAULT_SMART_QUOTES_OPTIONS: SmartQuotesOptions = {
  direction: 'to-straight',
  quotes: true,
  dashes: true,
  ellipsis: true,
};

/** Curly double/single quote variants (opening + closing + low/high forms) mapped to their straight ASCII equivalent. */
const CURLY_TO_STRAIGHT_QUOTES: ReadonlyMap<string, string> = new Map([
  ['‘', "'"],
  ['’', "'"],
  ['‚', "'"],
  ['‛', "'"],
  ['“', '"'],
  ['”', '"'],
  ['„', '"'],
  ['‟', '"'],
]);

function toStraight(text: string, options: SmartQuotesOptions): string {
  let result = text;

  if (options.quotes) {
    for (const [curly, straight] of CURLY_TO_STRAIGHT_QUOTES) {
      result = result.split(curly).join(straight);
    }
  }

  if (options.dashes) {
    result = result.split('—').join('--').split('–').join('-');
  }

  if (options.ellipsis) {
    result = result.split('…').join('...');
  }

  return result;
}

/**
 * Converts straight quotes to curly, using a best-effort heuristic: a quote
 * at the start of the string or preceded by whitespace/an opening bracket is
 * treated as an opening quote, everything else (including mid-word
 * apostrophes) as a closing quote/apostrophe.
 */
function toCurly(text: string, options: SmartQuotesOptions): string {
  let result = text;

  if (options.quotes) {
    result = result.replace(/(^|[\s([{—–-])"/g, (_match, before: string) => `${before}“`);
    result = result.replace(/"/g, '”');
    result = result.replace(/(^|[\s([{—–-])'/g, (_match, before: string) => `${before}‘`);
    result = result.replace(/'/g, '’');
  }

  if (options.dashes) {
    result = result.split('--').join('—');
  }

  if (options.ellipsis) {
    result = result.split('...').join('…');
  }

  return result;
}

export function normalizeSmartQuotes(text: string, options: SmartQuotesOptions): string {
  return options.direction === 'to-straight' ? toStraight(text, options) : toCurly(text, options);
}
