/**
 * Hand-rolled Flesch-Kincaid readability scoring for the Text Inspector
 * tool. Uses its own independent sentence/word/syllable tokenization
 * rather than reusing `text-metrics.ts`'s word split, to avoid coupling two
 * heuristics whose definitions might otherwise silently drift apart.
 *
 * The syllable-count heuristic (vowel-group approximation with a silent-e
 * adjustment) is the standard hand-rolled approach for English and is
 * necessarily approximate — no dictionary lookup is involved.
 */

export interface ReadabilityScore {
  readonly fleschKincaidGrade: number;
  readonly fleschReadingEase: number;
  readonly wordCount: number;
  readonly sentenceCount: number;
  readonly syllableCount: number;
}

const VOWEL_GROUPS = /[aeiouy]+/gi;

export function countSyllables(word: string): number {
  const cleaned = word.toLowerCase().replace(/[^a-z]/g, '');
  if (cleaned === '') return 0;

  let count = (cleaned.match(VOWEL_GROUPS) ?? []).length;
  if (cleaned.endsWith('e') && !cleaned.endsWith('le') && count > 1) count--;

  return Math.max(1, count);
}

/** Splits on `.`/`!`/`?` runs followed by whitespace or end-of-string — the standard heuristic; over-counts on abbreviations/decimals. */
function splitSentences(text: string): readonly string[] {
  const trimmed = text.trim();
  if (trimmed === '') return [];
  return trimmed.split(/[.!?]+(?:\s+|$)/).filter((s) => s !== '');
}

function splitWords(text: string): readonly string[] {
  return text
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z']/g, ''))
    .filter((w) => w !== '');
}

export function computeReadability(text: string): ReadabilityScore | null {
  const sentences = splitSentences(text);
  const words = splitWords(text);
  if (sentences.length === 0 || words.length === 0) return null;

  const syllableCount = words.reduce((sum, word) => sum + countSyllables(word), 0);
  const wordsPerSentence = words.length / sentences.length;
  const syllablesPerWord = syllableCount / words.length;

  const fleschKincaidGrade = 0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59;
  const fleschReadingEase = 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord;

  return {
    fleschKincaidGrade: Math.round(fleschKincaidGrade * 10) / 10,
    fleschReadingEase: Math.round(fleschReadingEase * 10) / 10,
    wordCount: words.length,
    sentenceCount: sentences.length,
    syllableCount,
  };
}

export function readingEaseLabel(score: number): string {
  if (score >= 90) return 'Very Easy';
  if (score >= 80) return 'Easy';
  if (score >= 70) return 'Fairly Easy';
  if (score >= 60) return 'Standard';
  if (score >= 50) return 'Fairly Difficult';
  if (score >= 30) return 'Difficult';
  return 'Very Confusing';
}
