import { faker } from '@faker-js/faker';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { LoremFormat, LoremOptions, LoremUnit, generateLorem } from './lorem-ipsum-generate';

const unitArb = fc.constantFrom<LoremUnit>('words', 'sentences', 'paragraphs');
const formatArb = fc.constantFrom<LoremFormat>('plain', 'html-list', 'markdown-list');
const countArb = fc.integer({ min: -5, max: 50 });

describe('generateLorem fuzzing', () => {
  it('never throws and always returns a string, across the full classic option space', () => {
    neverThrows(
      ([unit, format, count]: [LoremUnit, LoremFormat, number]) => generateLorem({ source: 'classic', unit, format, count }),
      fc.tuple(unitArb, formatArb, countArb),
      { assertShape: (result) => expect(typeof result).toBe('string') },
    );
  });

  it('never throws for the faker source either', () => {
    neverThrows(
      ([unit, format, count]: [LoremUnit, LoremFormat, number]) => generateLorem({ source: 'faker', unit, format, count }),
      fc.tuple(unitArb, formatArb, countArb),
      { assertShape: (result) => expect(typeof result).toBe('string'), numRuns: 30 },
    );
  });
});

describe('generateLorem output format', () => {
  it('produces exactly count units (clamped to >=1) for the classic source in plain format', () => {
    invariant(
      ([unit, count]: [LoremUnit, number]) => {
        const options: LoremOptions = { source: 'classic', unit, format: 'plain', count };
        const output = generateLorem(options);
        const expectedCount = Math.max(1, Math.trunc(count) || 1);
        const actualCount = unit === 'words' ? output.split(' ').length : output.split('\n\n').length;
        return { expectedCount, actualCount };
      },
      fc.tuple(unitArb, countArb),
      ({ expectedCount, actualCount }) => expectedCount === actualCount,
    );
  });

  it('formats each requested list format as a matching structure', () => {
    invariant(
      ([unit, format, count]: [LoremUnit, LoremFormat, number]) => generateLorem({ source: 'classic', unit, format, count }),
      fc.tuple(unitArb, fc.constantFrom<LoremFormat>('html-list', 'markdown-list'), countArb),
      (output, [, format]) =>
        format === 'html-list' ? /^<ul>\n( {2}<li>.*<\/li>\n?)+<\/ul>$/s.test(output) : output.split('\n').every((line) => line.startsWith('- ')),
    );
  });
});

describe('generateLorem determinism', () => {
  it('classic source is deterministic for the same options', () => {
    invariant(
      ([unit, format, count]: [LoremUnit, LoremFormat, number]) => {
        const options: LoremOptions = { source: 'classic', unit, format, count };
        return [generateLorem(options), generateLorem(options)] as const;
      },
      fc.tuple(unitArb, formatArb, countArb),
      ([first, second]) => first === second,
    );
  });

  it('faker source produces the same output for the same seed', () => {
    invariant(
      ([unit, format, count, seed]: [LoremUnit, LoremFormat, number, number]) => {
        const options: LoremOptions = { source: 'faker', unit, format, count };
        faker.seed(seed);
        const first = generateLorem(options);
        faker.seed(seed);
        const second = generateLorem(options);
        return [first, second] as const;
      },
      fc.tuple(unitArb, formatArb, countArb, fc.integer({ min: 0, max: 1_000_000 })),
      ([first, second]) => first === second,
      { numRuns: 30 },
    );
  });
});
