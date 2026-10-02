/**
 * The 128 standard ASCII characters (0-127), generated from the fixed control-code
 * name table below plus the printable-range code points, rather than hand-transcribed,
 * to avoid transposition errors across 128 rows.
 */
export type AsciiCategory = 'Control' | 'Space' | 'Printable' | 'Delete';

export interface AsciiEntry {
  readonly decimal: number;
  readonly hex: string;
  readonly octal: string;
  readonly char: string;
  readonly name: string;
  readonly category: AsciiCategory;
}

const CONTROL_NAMES: readonly string[] = [
  'NUL',
  'SOH',
  'STX',
  'ETX',
  'EOT',
  'ENQ',
  'ACK',
  'BEL',
  'BS',
  'HT',
  'LF',
  'VT',
  'FF',
  'CR',
  'SO',
  'SI',
  'DLE',
  'DC1',
  'DC2',
  'DC3',
  'DC4',
  'NAK',
  'SYN',
  'ETB',
  'CAN',
  'EM',
  'SUB',
  'ESC',
  'FS',
  'GS',
  'RS',
  'US',
];

function buildEntry(decimal: number): AsciiEntry {
  const hex = `0x${decimal.toString(16).toUpperCase().padStart(2, '0')}`;
  const octal = decimal.toString(8).padStart(3, '0');

  if (decimal < 32) {
    return { decimal, hex, octal, char: CONTROL_NAMES[decimal], name: CONTROL_NAMES[decimal], category: 'Control' };
  }
  if (decimal === 32) {
    return { decimal, hex, octal, char: 'SPACE', name: 'Space', category: 'Space' };
  }
  if (decimal === 127) {
    return { decimal, hex, octal, char: 'DEL', name: 'Delete', category: 'Delete' };
  }
  const char = String.fromCharCode(decimal);
  return { decimal, hex, octal, char, name: `Printable: '${char}'`, category: 'Printable' };
}

export const ASCII_TABLE: readonly AsciiEntry[] = Array.from({ length: 128 }, (_, decimal) => buildEntry(decimal));
