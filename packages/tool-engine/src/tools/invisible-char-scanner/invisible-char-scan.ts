import { unicodeName } from 'unicode-name';

export type InvisibleCharKind = 'control' | 'zero-width' | 'invisible';

export interface InvisibleCharRange {
  readonly kind: InvisibleCharKind;
  readonly start: number;
  readonly end: number;
}

/**
 * C0/C1 control codes (excluding tab/LF/CR, which are ordinary whitespace),
 * zero-width joining/formatting characters, and other characters that render
 * as nothing or as an invisible directional/formatting hint.
 */
const RANGES: readonly InvisibleCharRange[] = [
  { kind: 'control', start: 0x00, end: 0x08 },
  { kind: 'control', start: 0x0b, end: 0x0c },
  { kind: 'control', start: 0x0e, end: 0x1f },
  { kind: 'control', start: 0x7f, end: 0x7f },
  { kind: 'control', start: 0x80, end: 0x9f },
  { kind: 'zero-width', start: 0x200b, end: 0x200d },
  { kind: 'zero-width', start: 0x2060, end: 0x2060 },
  { kind: 'zero-width', start: 0xfe00, end: 0xfe0f },
  { kind: 'zero-width', start: 0xfeff, end: 0xfeff },
  { kind: 'zero-width', start: 0xe0100, end: 0xe01ef },
  { kind: 'invisible', start: 0x00ad, end: 0x00ad },
  { kind: 'invisible', start: 0x115f, end: 0x1160 },
  { kind: 'invisible', start: 0x180e, end: 0x180e },
  { kind: 'invisible', start: 0x200e, end: 0x200f },
  { kind: 'invisible', start: 0x202a, end: 0x202e },
  { kind: 'invisible', start: 0x2061, end: 0x2064 },
  { kind: 'invisible', start: 0x2066, end: 0x2069 },
  { kind: 'invisible', start: 0x3164, end: 0x3164 },
  { kind: 'invisible', start: 0xffa0, end: 0xffa0 },
];

export interface InvisibleCharOccurrence {
  readonly position: number;
  readonly char: string;
  readonly codePointHex: string;
  readonly kind: InvisibleCharKind;
  readonly name: string;
}

function classify(codePoint: number): InvisibleCharKind | null {
  for (const range of RANGES) {
    if (codePoint >= range.start && codePoint <= range.end) return range.kind;
  }
  return null;
}

/** Scans `text` code point by code point, reporting every control/zero-width/invisible character found. */
export function scanInvisibleChars(text: string): readonly InvisibleCharOccurrence[] {
  const occurrences: InvisibleCharOccurrence[] = [];
  const chars = Array.from(text);

  chars.forEach((char, position) => {
    const codePoint = char.codePointAt(0)!;
    const kind = classify(codePoint);
    if (kind === null) return;

    occurrences.push({
      position,
      char,
      codePointHex: `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`,
      kind,
      name: unicodeName(char) ?? '(unnamed)',
    });
  });

  return occurrences;
}

/** Removes every character matching one of the selected kinds. */
export function stripInvisibleChars(text: string, kinds: ReadonlySet<InvisibleCharKind>): string {
  return Array.from(text)
    .filter((char) => {
      const kind = classify(char.codePointAt(0)!);
      return kind === null || !kinds.has(kind);
    })
    .join('');
}
