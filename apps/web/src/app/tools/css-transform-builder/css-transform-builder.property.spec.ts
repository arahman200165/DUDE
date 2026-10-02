import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { TransformState, buildTransformValue, buildTransformDeclaration } from "@dude/tool-engine/tools/css-transform-builder/css-transform-logic";

const stateArb: fc.Arbitrary<TransformState> = fc.record({ translateX: fc.integer(), translateY: fc.integer(), scaleX: fc.double({ min: -10, max: 10, noNaN: true }), scaleY: fc.double({ min: -10, max: 10, noNaN: true }), rotate: fc.integer(), skewX: fc.integer(), skewY: fc.integer(), origin: fc.constantFrom('center', 'top left', 'bottom right') });
describe('css-transform-builder properties', () => {
  it('always produces a transform value and matching declaration', () => invariant(buildTransformValue, stateArb, (value, state) => (value === 'none' || /^(translate\(|rotate\(|scale\(|skew\()/.test(value)) && buildTransformDeclaration(state) === `transform: ${value};\ntransform-origin: ${state.origin};`));
  it('handles generated finite transform states without throwing', () => neverThrows(buildTransformDeclaration, stateArb));
});
