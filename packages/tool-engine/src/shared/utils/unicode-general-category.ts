/**
 * Unicode "General Category" lookup via native regex Unicode property escapes
 * (`\p{General_Category=Xx}`) — no data file, works for any code point the
 * running JS engine's Unicode tables support. Shared by Unicode Character
 * Inspector and Unicode Table so both report identical categories.
 */
export interface UnicodeGeneralCategory {
  readonly abbreviation: string;
  readonly label: string;
}

const CATEGORIES: readonly UnicodeGeneralCategory[] = [
  { abbreviation: 'Lu', label: 'Uppercase Letter' },
  { abbreviation: 'Ll', label: 'Lowercase Letter' },
  { abbreviation: 'Lt', label: 'Titlecase Letter' },
  { abbreviation: 'Lm', label: 'Modifier Letter' },
  { abbreviation: 'Lo', label: 'Other Letter' },
  { abbreviation: 'Mn', label: 'Nonspacing Mark' },
  { abbreviation: 'Mc', label: 'Spacing Mark' },
  { abbreviation: 'Me', label: 'Enclosing Mark' },
  { abbreviation: 'Nd', label: 'Decimal Number' },
  { abbreviation: 'Nl', label: 'Letter Number' },
  { abbreviation: 'No', label: 'Other Number' },
  { abbreviation: 'Pc', label: 'Connector Punctuation' },
  { abbreviation: 'Pd', label: 'Dash Punctuation' },
  { abbreviation: 'Ps', label: 'Open Punctuation' },
  { abbreviation: 'Pe', label: 'Close Punctuation' },
  { abbreviation: 'Pi', label: 'Initial Punctuation' },
  { abbreviation: 'Pf', label: 'Final Punctuation' },
  { abbreviation: 'Po', label: 'Other Punctuation' },
  { abbreviation: 'Sm', label: 'Math Symbol' },
  { abbreviation: 'Sc', label: 'Currency Symbol' },
  { abbreviation: 'Sk', label: 'Modifier Symbol' },
  { abbreviation: 'So', label: 'Other Symbol' },
  { abbreviation: 'Zs', label: 'Space Separator' },
  { abbreviation: 'Zl', label: 'Line Separator' },
  { abbreviation: 'Zp', label: 'Paragraph Separator' },
  { abbreviation: 'Cc', label: 'Control' },
  { abbreviation: 'Cf', label: 'Format' },
  { abbreviation: 'Cs', label: 'Surrogate' },
  { abbreviation: 'Co', label: 'Private Use' },
  { abbreviation: 'Cn', label: 'Unassigned' },
];

const CATEGORY_MATCHERS: readonly [RegExp, UnicodeGeneralCategory][] = CATEGORIES.map((category) => [
  new RegExp(`\\p{General_Category=${category.abbreviation}}`, 'u'),
  category,
]);

const UNKNOWN_CATEGORY: UnicodeGeneralCategory = { abbreviation: 'Cn', label: 'Unassigned' };

/** `char` must be exactly one Unicode code point (a single `Array.from(text)` element). */
export function generalCategoryOf(char: string): UnicodeGeneralCategory {
  for (const [pattern, category] of CATEGORY_MATCHERS) {
    if (pattern.test(char)) return category;
  }
  return UNKNOWN_CATEGORY;
}
