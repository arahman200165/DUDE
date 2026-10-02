export type CaseStyle =
  | 'camel'
  | 'pascal'
  | 'snake'
  | 'kebab'
  | 'constant'
  | 'title'
  | 'sentence'
  | 'dot'
  | 'path'
  | 'alternating';

export interface CaseStyleOption {
  readonly style: CaseStyle;
  readonly label: string;
}

export const CASE_STYLE_OPTIONS: readonly CaseStyleOption[] = [
  { style: 'camel', label: 'camelCase' },
  { style: 'pascal', label: 'PascalCase' },
  { style: 'snake', label: 'snake_case' },
  { style: 'kebab', label: 'kebab-case' },
  { style: 'constant', label: 'CONSTANT_CASE' },
  { style: 'title', label: 'Title Case' },
  { style: 'sentence', label: 'Sentence case' },
  { style: 'dot', label: 'dot.case' },
  { style: 'path', label: 'path/case' },
  { style: 'alternating', label: 'aLtErNaTiNg cAsE' },
];

/** Splits arbitrary-cased input into lowercase word tokens. */
export function tokenize(input: string): string[] {
  const normalized = input
    .replace(/[-_./]+/g, ' ')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2');

  return normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map((token) => token.toLowerCase());
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function alternatingCase(words: readonly string[]): string {
  let upper = false;
  let result = '';
  for (const char of words.join(' ')) {
    if (/[a-z]/i.test(char)) {
      result += upper ? char.toUpperCase() : char.toLowerCase();
      upper = !upper;
    } else {
      result += char;
    }
  }
  return result;
}

export function convertCase(input: string, style: CaseStyle): string {
  const words = tokenize(input);
  if (words.length === 0) return '';

  switch (style) {
    case 'camel':
      return words.map((word, index) => (index === 0 ? word : capitalize(word))).join('');
    case 'pascal':
      return words.map(capitalize).join('');
    case 'snake':
      return words.join('_');
    case 'kebab':
      return words.join('-');
    case 'constant':
      return words.map((word) => word.toUpperCase()).join('_');
    case 'title':
      return words.map(capitalize).join(' ');
    case 'sentence':
      return capitalize(words.join(' '));
    case 'dot':
      return words.join('.');
    case 'path':
      return words.join('/');
    case 'alternating':
      return alternatingCase(words);
  }
}
