import { faker } from '@faker-js/faker';

export type LoremSource = 'classic' | 'faker';
export type LoremUnit = 'words' | 'sentences' | 'paragraphs';
export type LoremFormat = 'plain' | 'html-list' | 'markdown-list';

export interface LoremOptions {
  readonly source: LoremSource;
  readonly unit: LoremUnit;
  readonly count: number;
  readonly format: LoremFormat;
}

const CLASSIC_PARAGRAPH =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ' +
  'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. ' +
  'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. ' +
  'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.';

const CLASSIC_WORDS = CLASSIC_PARAGRAPH.replace(/[.,]/g, '').split(/\s+/);
const CLASSIC_SENTENCES = CLASSIC_PARAGRAPH.split(/(?<=\.)\s+/);

function cycle<T>(source: readonly T[], count: number): readonly T[] {
  return Array.from({ length: count }, (_, i) => source[i % source.length]);
}

function generateUnits(options: LoremOptions): readonly string[] {
  if (options.source === 'faker') {
    switch (options.unit) {
      case 'words':
        return faker.lorem.words(options.count).split(' ');
      case 'sentences':
        return Array.from({ length: options.count }, () => faker.lorem.sentence());
      case 'paragraphs':
        return Array.from({ length: options.count }, () => faker.lorem.paragraph());
    }
  }

  switch (options.unit) {
    case 'words':
      return cycle(CLASSIC_WORDS, options.count);
    case 'sentences':
      return cycle(CLASSIC_SENTENCES, options.count);
    case 'paragraphs':
      return cycle([CLASSIC_PARAGRAPH], options.count);
  }
}

function formatOutput(units: readonly string[], options: LoremOptions): string {
  if (options.format === 'plain') {
    return options.unit === 'words' ? units.join(' ') : units.join('\n\n');
  }
  return formatList(units, options.format);
}

function formatList(items: readonly string[], format: LoremFormat): string {
  if (format === 'html-list') {
    return `<ul>\n${items.map((item) => `  <li>${item}</li>`).join('\n')}\n</ul>`;
  }
  return items.map((item) => `- ${item}`).join('\n');
}

export function generateLorem(options: LoremOptions): string {
  const count = Math.max(1, Math.trunc(options.count) || 1);
  const units = generateUnits({ ...options, count });
  return formatOutput(units, options);
}
