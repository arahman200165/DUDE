import slugify from '@sindresorhus/slugify';

export type SlugSeparator = '-' | '_';

export interface SlugOptions {
  readonly separator: SlugSeparator;
  readonly maxLength: number | null;
  readonly removeStopwords: boolean;
}

export const DEFAULT_SLUG_OPTIONS: SlugOptions = {
  separator: '-',
  maxLength: null,
  removeStopwords: false,
};

/** Common short English words that add noise to a slug without adding meaning. */
const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'of',
  'in',
  'on',
  'at',
  'to',
  'for',
  'with',
  'is',
  'are',
  'this',
  'that',
]);

function stripStopwords(input: string): string {
  return input
    .split(/\s+/)
    .filter((word) => word !== '' && !STOPWORDS.has(word.toLowerCase()))
    .join(' ');
}

/** Truncates a slug to `maxLength`, cutting at a separator boundary rather than mid-word. */
function truncate(slug: string, maxLength: number, separator: SlugSeparator): string {
  if (slug.length <= maxLength) return slug;
  if (slug[maxLength] === separator) return slug.slice(0, maxLength);

  const cut = slug.slice(0, maxLength);
  const lastSeparator = cut.lastIndexOf(separator);
  return lastSeparator > 0 ? cut.slice(0, lastSeparator) : cut;
}

export function generateSlug(input: string, options: SlugOptions): string {
  const source = options.removeStopwords ? stripStopwords(input) : input;
  const slug = slugify(source, { separator: options.separator });

  return options.maxLength && options.maxLength > 0 ? truncate(slug, options.maxLength, options.separator) : slug;
}
