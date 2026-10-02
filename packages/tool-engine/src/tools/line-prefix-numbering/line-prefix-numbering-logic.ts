export type PerLineTransform = 'uppercase' | 'lowercase' | 'trim' | 'wrap-quotes' | 'find-replace';

export interface LineNumberOptions {
  readonly start: number;
  readonly padded: boolean;
  readonly separator: string;
}

export interface FindReplaceOptions {
  readonly find: string;
  readonly replace: string;
}

export function addPrefixSuffix(text: string, prefix: string, suffix: string): string {
  return text
    .split('\n')
    .map((line) => `${prefix}${line}${suffix}`)
    .join('\n');
}

export function addLineNumbers(text: string, options: LineNumberOptions): string {
  const lines = text.split('\n');
  const width = String(options.start + lines.length - 1).length;

  return lines
    .map((line, index) => {
      const n = options.start + index;
      const label = options.padded ? String(n).padStart(width, '0') : String(n);
      return `${label}${options.separator}${line}`;
    })
    .join('\n');
}

const LEADING_NUMBER_PATTERN = /^\s*\d+[.):]?\s*/;

export function removeLineNumbers(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(LEADING_NUMBER_PATTERN, ''))
    .join('\n');
}

export function applyPerLineTransform(text: string, transform: PerLineTransform, findReplace?: FindReplaceOptions): string {
  return text
    .split('\n')
    .map((line) => transformLine(line, transform, findReplace))
    .join('\n');
}

function transformLine(line: string, transform: PerLineTransform, findReplace?: FindReplaceOptions): string {
  switch (transform) {
    case 'uppercase':
      return line.toUpperCase();
    case 'lowercase':
      return line.toLowerCase();
    case 'trim':
      return line.trim();
    case 'wrap-quotes':
      return `"${line}"`;
    case 'find-replace':
      if (!findReplace || findReplace.find === '') return line;
      return line.split(findReplace.find).join(findReplace.replace);
  }
}
