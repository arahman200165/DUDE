import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { BorderRadiusCorners, buildBorderRadiusValue, buildBorderRadiusDeclaration } from "@dude/tool-engine/tools/border-radius-generator/border-radius-logic";

const cornersArb = fc.record({ topLeft: fc.integer(), topRight: fc.integer(), bottomRight: fc.integer(), bottomLeft: fc.integer() });
describe('border-radius-generator properties', () => {
  it('emits a valid unit-bearing radius value and declaration', () => {
    invariant(([corners, unit]: [BorderRadiusCorners, 'px' | '%']) => [buildBorderRadiusValue(corners, unit), buildBorderRadiusDeclaration(corners, unit)], fc.tuple(cornersArb, fc.constantFrom('px' as const, '%' as const)), ([value, declaration]) => /-?\d+(px|%)( -?\d+(px|%)){0,3}/.test(value) && declaration === `border-radius: ${value};`);
  });
  it('handles arbitrary numeric corners', () => neverThrows((corners: BorderRadiusCorners) => buildBorderRadiusDeclaration(corners, 'px'), cornersArb));
});
