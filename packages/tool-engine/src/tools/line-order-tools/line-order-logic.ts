import { hostCrypto } from "@dude/crypto/host";
export type SortVariant = 'asc' | 'desc' | 'natural' | 'by-length';

/** Splits a string into alternating non-digit/digit runs, e.g. "item10" -> ["item", "10"]. */
function naturalKey(value: string): readonly (string | number)[] {
  return value.split(/(\d+)/).map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}

function compareNatural(a: string, b: string): number {
  const keyA = naturalKey(a);
  const keyB = naturalKey(b);
  const length = Math.max(keyA.length, keyB.length);

  for (let i = 0; i < length; i++) {
    const partA = keyA[i];
    const partB = keyB[i];
    if (partA === undefined) return -1;
    if (partB === undefined) return 1;

    if (typeof partA === 'number' && typeof partB === 'number') {
      if (partA !== partB) return partA - partB;
    } else {
      const strA = String(partA);
      const strB = String(partB);
      if (strA !== strB) return strA < strB ? -1 : 1;
    }
  }

  return 0;
}

export function sortLines(text: string, variant: SortVariant): string {
  const lines = text.split('\n');

  switch (variant) {
    case 'asc':
      return [...lines].sort((a, b) => a.localeCompare(b)).join('\n');
    case 'desc':
      return [...lines].sort((a, b) => b.localeCompare(a)).join('\n');
    case 'natural':
      return [...lines].sort(compareNatural).join('\n');
    case 'by-length':
      return [...lines].sort((a, b) => a.length - b.length).join('\n');
  }
}

export function reverseLines(text: string): string {
  return [...text.split('\n')].reverse().join('\n');
}

/** Fisher-Yates shuffle backed by crypto.getRandomValues rather than Math.random. */
export function shuffleLines(text: string): string {
  const lines = text.split('\n');
  const randomValues = new Uint32Array(lines.length);
  hostCrypto().getRandomValues(randomValues);

  for (let i = lines.length - 1; i > 0; i--) {
    const j = randomValues[i] % (i + 1);
    [lines[i], lines[j]] = [lines[j], lines[i]];
  }

  return lines.join('\n');
}
