export interface DuplicateEntry {
  readonly value: string;
  readonly count: number;
  readonly firstLineNumber: number;
}

function normalize(value: string, caseSensitive: boolean): string {
  return caseSensitive ? value : value.toLowerCase();
}

/** Finds every line that occurs more than once, in order of first occurrence. */
export function findDuplicateLines(text: string, caseSensitive: boolean): readonly DuplicateEntry[] {
  const lines = text.split('\n');
  const seen = new Map<string, { value: string; count: number; firstLineNumber: number }>();

  lines.forEach((line, index) => {
    if (line.trim() === '') return;
    const key = normalize(line, caseSensitive);
    const existing = seen.get(key);
    if (existing) existing.count++;
    else seen.set(key, { value: line, count: 1, firstLineNumber: index + 1 });
  });

  return Array.from(seen.values()).filter((entry) => entry.count > 1);
}

/** Removes every line after its first occurrence, preserving original order. */
export function removeDuplicateLines(text: string, caseSensitive: boolean): string {
  const seen = new Set<string>();
  return text
    .split('\n')
    .filter((line) => {
      if (line.trim() === '') return true;
      const key = normalize(line, caseSensitive);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join('\n');
}

const WORD_PATTERN = /[\p{L}\p{N}'-]+/gu;

/** Finds every word that occurs more than once (word-boundary tokenized), in order of first occurrence. */
export function findDuplicateWords(text: string, caseSensitive: boolean): readonly DuplicateEntry[] {
  const seen = new Map<string, { value: string; count: number; firstLineNumber: number }>();
  const lines = text.split('\n');

  lines.forEach((line, lineIndex) => {
    const words = line.match(WORD_PATTERN) ?? [];
    for (const word of words) {
      const key = normalize(word, caseSensitive);
      const existing = seen.get(key);
      if (existing) existing.count++;
      else seen.set(key, { value: word, count: 1, firstLineNumber: lineIndex + 1 });
    }
  });

  return Array.from(seen.values()).filter((entry) => entry.count > 1);
}
