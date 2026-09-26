/**
 * Deterministic large-input generators for the performance regression corpus (DUDE_PRD.md §21
 * Phase 23 Item 10) -- procedural, not committed binary blobs, so these stay in sync with
 * whatever size the budget actually needs without bloating the repo.
 */

export function buildLargeText(approxBytes: number): string {
  const line = 'The quick brown fox jumps over the lazy dog. 0123456789.\n';
  const repeats = Math.ceil(approxBytes / line.length);
  return line.repeat(repeats);
}

/** Same base text with every 37th line perturbed, so a real diff (not a same/same short-circuit) is exercised. */
export function buildDiffPair(lineCount: number): { readonly left: string; readonly right: string } {
  const lines = Array.from({ length: lineCount }, (_, i) => `line ${i}: the quick brown fox jumps over the lazy dog`);
  const left = lines.join('\n');
  const right = lines.map((line, i) => (i % 37 === 0 ? `${line} (modified)` : line)).join('\n');
  return { left, right };
}

export function buildLargeJsonText(approxBytes: number): string {
  const recordSize = 80;
  const count = Math.ceil(approxBytes / recordSize);
  const records = Array.from({ length: count }, (_, i) => ({ id: i, name: `item-${i}`, active: i % 2 === 0, value: i * 1.5 }));
  return JSON.stringify(records);
}

/** Repeats a deterministic byte pattern without storing a large fixture in the repository. */
export function buildBinary(size: number, seed = 0): Uint8Array {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) bytes[i] = (i * 31 + (i >>> 8) + seed) & 0xff;
  return bytes;
}
