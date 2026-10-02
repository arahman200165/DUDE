import { distance } from 'fastest-levenshtein';

export interface SimilarityResult {
  readonly levenshteinDistance: number;
  readonly levenshteinSimilarity: number;
  readonly jaroWinklerSimilarity: number;
}

/** Levenshtein similarity normalized to 0-1 (1 = identical), relative to the longer string's length. */
function levenshteinSimilarity(a: string, b: string, editDistance: number): number {
  const maxLength = Math.max(a.length, b.length);
  return maxLength === 0 ? 1 : 1 - editDistance / maxLength;
}

/**
 * Jaro similarity (0-1), hand-rolled per the standard algorithm: find matching characters within a
 * sliding window, then count transpositions among the matched characters.
 */
function jaro(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const matchDistance = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatches = new Array<boolean>(a.length).fill(false);
  const bMatches = new Array<boolean>(b.length).fill(false);

  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, b.length);
    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  transpositions = transpositions / 2;

  return (matches / a.length + matches / b.length + (matches - transpositions) / matches) / 3;
}

/** Jaro-Winkler similarity (0-1): Jaro similarity boosted for a shared prefix (up to 4 chars, scale 0.1). */
function jaroWinkler(a: string, b: string): number {
  const jaroSimilarity = jaro(a, b);
  const prefixLength = commonPrefixLength(a, b, 4);
  return jaroSimilarity + prefixLength * 0.1 * (1 - jaroSimilarity);
}

function commonPrefixLength(a: string, b: string, max: number): number {
  const limit = Math.min(max, a.length, b.length);
  let length = 0;
  while (length < limit && a[length] === b[length]) length++;
  return length;
}

export function compareStrings(a: string, b: string): SimilarityResult {
  const editDistance = distance(a, b);
  return {
    levenshteinDistance: editDistance,
    levenshteinSimilarity: levenshteinSimilarity(a, b, editDistance),
    jaroWinklerSimilarity: jaroWinkler(a, b),
  };
}
