/**
 * Part naming and part-set detection for File Split & Join (Phase 29 items 5 and 6, Milestone 532).
 * Three conventions: `name.ext.001` (7-Zip/HJSplit style), `name.ext.aa` (GNU `split` suffixes), and
 * `name-001.ext` (keeps the extension usable, handy for CSV parts).
 */

export type PartNaming = 'numeric' | 'alpha' | 'numbered-ext';

export function alphaSuffix(index: number, width = 2): string {
  let value = index;
  let out = '';
  for (let position = 0; position < width; position++) { out = String.fromCharCode(97 + (value % 26)) + out; value = Math.floor(value / 26); }
  return out;
}

/** 0-based `index` → part file name. */
export function partName(fileName: string, index: number, naming: PartNaming, digits = 3): string {
  if (naming === 'alpha') return `${fileName}.${alphaSuffix(index)}`;
  const number = String(index + 1).padStart(digits, '0');
  if (naming === 'numeric') return `${fileName}.${number}`;
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? `${fileName.slice(0, dot)}-${number}${fileName.slice(dot)}` : `${fileName}-${number}`;
}

export function sizeRanges(total: number, partSize: number): { start: number; end: number }[] {
  const size = Math.max(1, Math.floor(partSize));
  const ranges: { start: number; end: number }[] = [];
  for (let start = 0; start < total; start += size) ranges.push({ start, end: Math.min(total, start + size) });
  return ranges.length ? ranges : [{ start: 0, end: 0 }];
}

export function countRanges(total: number, parts: number): { start: number; end: number }[] {
  return sizeRanges(total, Math.ceil(total / Math.max(1, Math.floor(parts))));
}

export interface PartSet {
  /** The joined file's name, e.g. `backup.tar` for `backup.tar.001…`. */
  readonly base: string;
  readonly naming: PartNaming;
  /** Part names in join order. */
  readonly parts: readonly string[];
  /** Missing positions (1-based) between the first and last part found. */
  readonly gaps: readonly number[];
}

function alphaIndex(suffix: string): number { let value = 0; for (const char of suffix) value = value * 26 + (char.charCodeAt(0) - 97); return value; }

/** Groups a folder's file names into split-part sets (at least two parts each). */
export function detectPartSets(names: readonly string[]): PartSet[] {
  const groups = new Map<string, { naming: PartNaming; base: string; parts: { name: string; index: number }[] }>();
  const add = (key: string, naming: PartNaming, base: string, name: string, index: number) => {
    const group = groups.get(key) ?? { naming, base, parts: [] };
    group.parts.push({ name, index });
    groups.set(key, group);
  };
  for (const name of names) {
    let match = /^(.+)\.(\d{3,})$/.exec(name);
    if (match) { add(`n:${match[1]}:${match[2].length}`, 'numeric', match[1], name, Number(match[2]) - 1); continue; }
    match = /^(.+)-(\d{3,})(\.[^.]+)?$/.exec(name);
    if (match) { add(`e:${match[1]}${match[3] ?? ''}:${match[2].length}`, 'numbered-ext', `${match[1]}${match[3] ?? ''}`, name, Number(match[2]) - 1); continue; }
    match = /^(.+)\.([a-z]{2})$/.exec(name);
    if (match) add(`a:${match[1]}`, 'alpha', match[1], name, alphaIndex(match[2]));
  }
  const sets: PartSet[] = [];
  for (const group of groups.values()) {
    if (group.parts.length < 2) continue;
    const sorted = group.parts.sort((a, b) => a.index - b.index);
    // An alpha "set" must start at `aa`, or ordinary two-letter extensions (.md, .py) would qualify.
    if (group.naming === 'alpha' && sorted[0].index !== 0) continue;
    const present = new Set(sorted.map((part) => part.index));
    const gaps: number[] = [];
    for (let index = 0; index <= sorted[sorted.length - 1].index; index++) if (!present.has(index)) gaps.push(index + 1);
    sets.push({ base: group.base, naming: group.naming, parts: sorted.map((part) => part.name), gaps });
  }
  return sets.sort((a, b) => a.base.localeCompare(b.base));
}
