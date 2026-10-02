import { ENGLISH_STOP_WORDS } from "./stop-words-data.js";

export interface KeywordFrequencyOptions {
  readonly ignoreStopWords: boolean;
  readonly minLength: number;
  readonly caseSensitive: boolean;
}

export interface KeywordFrequencyEntry {
  readonly word: string;
  readonly count: number;
}

const WORD_PATTERN = /[\p{L}\p{N}'-]+/gu;

export function computeKeywordFrequency(text: string, options: KeywordFrequencyOptions): readonly KeywordFrequencyEntry[] {
  const words = text.match(WORD_PATTERN) ?? [];
  const counts = new Map<string, number>();

  for (const rawWord of words) {
    const word = options.caseSensitive ? rawWord : rawWord.toLowerCase();
    if (word.length < options.minLength) continue;
    if (options.ignoreStopWords && ENGLISH_STOP_WORDS.has(word.toLowerCase())) continue;

    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
}
