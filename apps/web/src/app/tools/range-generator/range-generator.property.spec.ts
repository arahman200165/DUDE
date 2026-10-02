import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant } from "../../../../../../tests/property-harness";
import { generateRange } from "@dude/tool-engine/tools/range-generator/range-generate";

describe('range generator properties', () => {
  it('generates bounded ascending integer ranges including their start', () => {
    invariant(
      ({ start, count, step }) => generateRange({ start, end: start + (count - 1) * step, step }),
      fc.record({ start: fc.integer({ min: -1000, max: 1000 }), count: fc.integer({ min: 1, max: 100 }), step: fc.integer({ min: 1, max: 20 }) }),
      (result, { start, count, step }) => result.ok && result.value.length === count && result.value[0] === start && result.value.every((value, index) => value === start + index * step),
    );
  });
});
