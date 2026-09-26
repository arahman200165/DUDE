import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { extractColumns, ExtractColumnsOptions, parseColumnSpec } from './extract-columns-logic';

const lineArb = fc.string().filter((s) => !s.includes('\n'));
const textArb = fc.array(lineArb, { maxLength: 20 }).map((lines) => lines.join('\n'));
const columnSpecArb = fc
  .array(fc.integer({ min: 1, max: 20 }), { maxLength: 6 })
  .map((numbers) => numbers.join(','));
const optionsArb = fc.record({
  delimiter: fc.constantFrom(',', '\t', '|', ';'),
  columnSpec: columnSpecArb,
  outputDelimiter: fc.constantFrom(',', '\t', '|', ';'),
});

describe('extract-columns fuzzing', () => {
  it('never throws for arbitrary text/options', () => {
    neverThrows(([text, options]: [string, ExtractColumnsOptions]) => extractColumns(text, options), fc.tuple(textArb, optionsArb));
  });

  it('parseColumnSpec only ever returns positive integers', () => {
    invariant(
      (spec: string) => parseColumnSpec(spec),
      fc.string(),
      (indices) => indices.every((n) => Number.isInteger(n) && n > 0),
    );
  });

  it('extractColumns always preserves the input line count', () => {
    invariant(
      ([text, options]: [string, ExtractColumnsOptions]) => ({ text, output: extractColumns(text, options) }),
      fc.tuple(textArb, optionsArb),
      ({ text, output }) => output.split('\n').length === text.split('\n').length,
    );
  });
});
