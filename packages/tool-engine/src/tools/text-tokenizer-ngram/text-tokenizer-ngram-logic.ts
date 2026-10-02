export type TokenGranularity = 'word' | 'sentence';
export type NGramLevel = 'word' | 'char';

export interface Token {
  readonly text: string;
  readonly isWordLike: boolean;
}

/** Tokenizes text into words or sentences using the native, Unicode-aware Intl.Segmenter. */
export function tokenize(text: string, granularity: TokenGranularity): readonly Token[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity });
  return Array.from(segmenter.segment(text), (segment) => ({
    text: segment.segment,
    isWordLike: granularity === 'word' ? (segment.isWordLike ?? false) : segment.segment.trim() !== '',
  }));
}

function wordTokens(text: string): readonly string[] {
  return tokenize(text, 'word')
    .filter((t) => t.isWordLike)
    .map((t) => t.text);
}

export interface NGramEntry {
  readonly ngram: string;
  readonly count: number;
}

/** Generates n-grams at word or character granularity, with occurrence counts, in order of first appearance. */
export function generateNGrams(text: string, level: NGramLevel, n: number): readonly NGramEntry[] {
  const size = Math.max(1, Math.trunc(n) || 1);
  const units = level === 'word' ? wordTokens(text) : Array.from(text);
  const separator = level === 'word' ? ' ' : '';

  if (units.length < size) return [];

  const counts = new Map<string, number>();
  for (let i = 0; i <= units.length - size; i++) {
    const gram = units.slice(i, i + size).join(separator);
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }

  return Array.from(counts.entries()).map(([ngram, count]) => ({ ngram, count }));
}
