import { metaphone } from 'metaphone';
import { soundex } from 'soundex-code';

export interface PhoneticEntry {
  readonly word: string;
  readonly soundex: string;
  readonly metaphone: string;
}

/** Splits bulk input on newlines and commas, computing both codes for each non-empty word. */
export function generatePhoneticCodes(rawInput: string): readonly PhoneticEntry[] {
  return rawInput
    .split(/[\n,]+/)
    .map((word) => word.trim())
    .filter((word) => word !== '')
    .map((word) => ({ word, soundex: soundex(word), metaphone: metaphone(word) }));
}
