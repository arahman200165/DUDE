export interface MarkdownStats {
  readonly words: number;
  readonly characters: number;
  readonly charactersNoSpaces: number;
  readonly readingTimeMinutes: number;
}

const WORDS_PER_MINUTE = 200;

export function computeStats(text: string): MarkdownStats {
  const trimmed = text.trim();
  const words = trimmed === '' ? 0 : trimmed.split(/\s+/).length;
  const characters = text.length;
  const charactersNoSpaces = text.replace(/\s/g, '').length;
  const readingTimeMinutes = words === 0 ? 0 : Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));

  return { words, characters, charactersNoSpaces, readingTimeMinutes };
}
