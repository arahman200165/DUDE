import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { BezierPoints, buildCubicBezierValue, validateBezierPoints } from "@dude/tool-engine/tools/cubic-bezier-editor/cubic-bezier-logic";

const pointsArb: fc.Arbitrary<BezierPoints> = fc.record({ x1: fc.double({ min: -5, max: 5, noNaN: true }), y1: fc.double({ min: -20, max: 20, noNaN: true }), x2: fc.double({ min: -5, max: 5, noNaN: true }), y2: fc.double({ min: -20, max: 20, noNaN: true }) });
describe('cubic-bezier-editor properties', () => {
  it('validates only x coordinates against the inclusive unit interval', () => invariant(validateBezierPoints, pointsArb, (result, p) => result.ok === (p.x1 >= 0 && p.x1 <= 1 && p.x2 >= 0 && p.x2 <= 1)));
  it('emits the four supplied coordinates and does not throw', () => neverThrows((points: BezierPoints) => buildCubicBezierValue(points), pointsArb));
});
