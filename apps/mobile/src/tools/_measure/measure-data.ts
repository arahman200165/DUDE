/** Deterministic measurement inputs (xorshift32 PRNG, ASCII only so characters equal UTF-8 bytes). Never random, never user data. */
export const MIB = 1024 * 1024;
export const KIB = 1024;

/**
 * Measurement ceilings: the input caps the tools had before the Phase 31I budgets (2 MiB text, 512 KiB csv and diff side, 64 KiB regex).
 * Runs are generated at 25, 50 and 100 percent of these so the evidence stays comparable after a shipped cap shrinks;
 * measure-data.spec.ts asserts every live cap is at or below its ceiling.
 */
export const HASH_CAP = 2 * MIB;
export const JSON_CAP = 2 * MIB;
export const YAML_CAP = 2 * MIB;
export const XML_CAP = 2 * MIB;
export const CSV_CAP = 512 * KIB;
export const DIFF_SIDE_CAP = 512 * KIB;
export const MAIN_THREAD_CAP = 2 * MIB;
export const REGEX_CAP = 64 * KIB;

export function rng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state / 4294967296;
  };
}

const WORDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet', 'kilo', 'lima', 'mike', 'november', 'oscar', 'papa', 'quebec', 'romeo', 'sierra', 'tango', 'uniform', 'victor', 'whiskey', 'xray', 'yankee', 'zulu', 'the', 'and', 'of', 'to', 'in', 'is', 'that', 'it'];

/** One line of 3 to 8 words (about 25 to 50 characters), no trailing newline. */
function sentence(next: () => number): string {
  const count = 3 + Math.floor(next() * 6);
  const parts: string[] = [];
  for (let index = 0; index < count; index++) parts.push(WORDS[Math.floor(next() * WORDS.length)]!);
  const text = parts.join(' ');
  return text[0]!.toUpperCase() + text.slice(1) + '.';
}

const word = (next: () => number): string => WORDS[Math.floor(next() * WORDS.length)]!;

/** Joins `produce()` pieces until the next piece would exceed `limit` characters. */
function fill(limit: number, head: string, tail: string, separator: string, produce: (index: number) => string): string {
  const pieces: string[] = [];
  let size = head.length + tail.length;
  for (let index = 0; ; index++) {
    const piece = produce(index);
    const added = piece.length + (pieces.length ? separator.length : 0);
    if (size + added > limit) break;
    pieces.push(piece);
    size += added;
  }
  return head + pieces.join(separator) + tail;
}

/** Plain prose lines, exactly `size` characters (the last line is cut). Used for hash, base64, case, text inspector, regex. */
export function proseText(size: number, seed = 1): string {
  const next = rng(seed);
  const lines: string[] = [];
  let total = 0;
  while (total < size) { const line = sentence(next); lines.push(line); total += line.length + 1; }
  return lines.join('\n').slice(0, size);
}

/** An array of record objects, always valid JSON, at most `limit` characters. */
export function jsonText(limit: number, seed = 2): string {
  const next = rng(seed);
  return fill(limit, '[', ']', ',', index => JSON.stringify({
    id: index, name: `item-${index}`, active: next() > 0.5, score: Math.round(next() * 100000) / 100,
    tags: [word(next), word(next)],
    nested: { note: sentence(next), depth: { a: Math.floor(next() * 1000), b: null } },
  }));
}

/** A YAML sequence of mappings with nested lists, at most `limit` characters. */
export function yamlText(limit: number, seed = 3): string {
  const next = rng(seed);
  return fill(limit, '', '\n', '\n', index => [
    `- id: ${index}`,
    `  name: item-${index}`,
    `  active: ${next() > 0.5}`,
    `  score: ${Math.round(next() * 100000) / 100}`,
    '  tags:',
    `    - ${word(next)}`,
    `    - ${word(next)}`,
    '  nested:',
    `    note: "${sentence(next)}"`,
    `    depth: { a: ${Math.floor(next() * 1000)}, b: null }`,
  ].join('\n'));
}

/** A single-root XML document of records with attributes and nested elements, at most `limit` characters. */
export function xmlText(limit: number, seed = 4): string {
  const next = rng(seed);
  return fill(limit, '<?xml version="1.0"?><catalog>', '</catalog>', '', index =>
    `<item id="${index}" kind="${word(next)}"><name>item-${index}</name><note>${sentence(next)}</note><price currency="USD">${Math.round(next() * 100000) / 100}</price><tags><tag>${word(next)}</tag><tag>${word(next)}</tag></tags></item>`);
}

/** Header plus rows with some quoted fields (commas and doubled quotes), at most `limit` characters. */
export function csvText(limit: number, seed = 5): string {
  const next = rng(seed);
  const header = 'id,name,email,score,comment,active';
  return fill(limit, `${header}\n`, '', '\n', index => {
    const comment = next() > 0.7 ? `"${sentence(next).replace(/\./, ', and ""quoted"".')}"` : sentence(next).replace(/\./, '');
    return `${index},item-${index},user${index}@example.com,${Math.round(next() * 100000) / 100},${comment},${next() > 0.5}`;
  });
}

/** Two multi-line texts: `left` of at most `limit` characters and `right`, which differs by roughly one line in ten (edits, deletions, insertions). */
export function diffTexts(limit: number, seed = 6): { readonly left: string; readonly right: string } {
  const next = rng(seed);
  const leftLines: string[] = [];
  let size = 0;
  for (let index = 0; ; index++) {
    const line = `${String(index).padStart(6, '0')} ${sentence(next)}`;
    if (size + line.length + 1 > limit) break;
    leftLines.push(line);
    size += line.length + 1;
  }
  const rightLines: string[] = [];
  for (const line of leftLines) {
    const roll = next();
    if (roll < 0.04) rightLines.push(`${line} (edited)`);
    else if (roll < 0.07) continue;
    else if (roll < 0.1) { rightLines.push(line); rightLines.push(`inserted ${sentence(next)}`); }
    else rightLines.push(line);
  }
  let right = rightLines.join('\n');
  // The right side is bound by the same per-side cap.
  if (right.length > limit) right = right.slice(0, limit);
  return { left: leftLines.join('\n'), right };
}

export const PERCENTS = [25, 50, 100] as const;
export const sizeAt = (cap: number, percent: number): number => Math.floor(cap * percent / 100);
