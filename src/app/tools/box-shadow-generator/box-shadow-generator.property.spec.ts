import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { ShadowLayer, buildBoxShadowValue, buildBoxShadowDeclaration } from './box-shadow-logic';

const layerArb: fc.Arbitrary<ShadowLayer> = fc.record({ offsetX: fc.integer(), offsetY: fc.integer(), blur: fc.integer(), spread: fc.integer(), color: fc.constantFrom('red', '#123456', 'rgba(0,0,0,.2)'), inset: fc.boolean() });
const layersArb = fc.array(layerArb, { maxLength: 8 });
describe('box-shadow-generator properties', () => {
  it('produces one formatted layer per input and none for an empty list', () => invariant(buildBoxShadowValue, layersArb, (value, layers) => (layers.length === 0 ? value === 'none' : value.split(', ').length === layers.length) && buildBoxShadowDeclaration(layers) === `box-shadow: ${value};`));
  it('formats arbitrary bounded layer lists without throwing', () => neverThrows(buildBoxShadowDeclaration, layersArb));
});
