import { generalCategoryOf } from "../../shared/utils/unicode-general-category.js";
import { blockNameOf } from "../../shared/utils/unicode-blocks.js";
import { unicodeName } from 'unicode-name';

export interface CharacterInfo {
  readonly char: string;
  readonly codePointDecimal: number;
  readonly codePointHex: string;
  readonly utf8Bytes: string;
  readonly utf16Units: string;
  readonly categoryAbbreviation: string;
  readonly categoryLabel: string;
  readonly block: string;
  readonly name: string;
}

export interface CharacterAnalysis {
  readonly entries: readonly CharacterInfo[];
  readonly totalCount: number;
  readonly truncated: boolean;
}

const MAX_CHARACTERS = 2000;

const encoder = new TextEncoder();

/** Analyzes each Unicode code point in `text` individually, capped at `MAX_CHARACTERS` for display. */
export function analyzeCharacters(text: string): CharacterAnalysis {
  const chars = Array.from(text);
  const truncated = chars.length > MAX_CHARACTERS;
  const entries = chars.slice(0, MAX_CHARACTERS).map(analyzeCharacter);

  return { entries, totalCount: chars.length, truncated };
}

function analyzeCharacter(char: string): CharacterInfo {
  const codePoint = char.codePointAt(0)!;
  const category = generalCategoryOf(char);
  const utf8Bytes = Array.from(encoder.encode(char))
    .map((byte) => byte.toString(16).padStart(2, '0').toUpperCase())
    .join(' ');

  return {
    char,
    codePointDecimal: codePoint,
    codePointHex: `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`,
    utf8Bytes,
    utf16Units: utf16UnitsOf(char),
    categoryAbbreviation: category.abbreviation,
    categoryLabel: category.label,
    block: blockNameOf(codePoint),
    name: unicodeName(char) ?? '(unnamed)',
  };
}

function utf16UnitsOf(char: string): string {
  const units: number[] = [];
  for (let i = 0; i < char.length; i++) {
    units.push(char.charCodeAt(i));
  }
  return units.map((unit) => unit.toString(16).padStart(4, '0').toUpperCase()).join(' ');
}
