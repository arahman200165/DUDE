import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { buildRangeMarkers, parseMultiTimestamps } from "@dude/tool-engine/tools/epoch-timeline-visualizer/epoch-timeline-visualizer-logic";

describe('parseMultiTimestamps / buildRangeMarkers fuzzing', () => {
  it('parseMultiTimestamps never throws for arbitrary text', () => {
    neverThrows(
      ([text, includeNow, nowMs]: [string, boolean, number]) => parseMultiTimestamps(text, includeNow, nowMs),
      fc.tuple(fc.string(), fc.boolean(), fc.double()),
    );
  });

  it('buildRangeMarkers never throws for arbitrary numeric input', () => {
    neverThrows(
      (input: { startMs: number; endMs: number; includeNow: boolean; nowMs: number }) => buildRangeMarkers(input),
      fc.record({ startMs: fc.double(), endMs: fc.double(), includeNow: fc.boolean(), nowMs: fc.double() }),
    );
  });
});

describe('buildRangeMarkers invariants', () => {
  it('pads the range strictly around start/end for any valid ordered range', () => {
    invariant(
      ([startMs, endMs]: [number, number]) => buildRangeMarkers({ startMs, endMs, includeNow: false, nowMs: 0 }),
      fc
        .tuple(fc.integer({ min: -1e12, max: 1e12 }), fc.integer({ min: -1e12, max: 1e12 }))
        .filter(([s, e]) => e > s),
      (result, [startMs, endMs]) => result.ok && result.rangeStartMs < startMs && result.rangeEndMs > endMs,
    );
  });
});

describe('parseMultiTimestamps invariants', () => {
  it('a single epoch-millisecond marker falls within its own padded range', () => {
    invariant(
      (epochMs: number) => parseMultiTimestamps(String(epochMs), false, 0),
      fc.integer({ min: 1_000_000_000_000, max: 9_999_999_999_999 }),
      (result, epochMs) => result.ok && result.rangeStartMs <= epochMs && epochMs <= result.rangeEndMs,
    );
  });
});
