import { ShadowLayer, buildBoxShadowDeclaration, buildBoxShadowValue, formatShadowLayer } from "./box-shadow-logic.js";

const LAYER: ShadowLayer = { offsetX: 2, offsetY: 4, blur: 8, spread: 0, color: 'rgba(0,0,0,0.5)', inset: false };

describe('formatShadowLayer', () => {
  it('formats a single layer as offset/blur/spread/color', () => {
    expect(formatShadowLayer(LAYER)).toBe('2px 4px 8px 0px rgba(0,0,0,0.5)');
  });

  it('prefixes inset shadows with "inset "', () => {
    expect(formatShadowLayer({ ...LAYER, inset: true })).toBe('inset 2px 4px 8px 0px rgba(0,0,0,0.5)');
  });

  it('supports negative offsets and spread', () => {
    expect(formatShadowLayer({ ...LAYER, offsetX: -2, spread: -4 })).toBe('-2px 4px 8px -4px rgba(0,0,0,0.5)');
  });
});

describe('buildBoxShadowValue', () => {
  it('joins multiple layers with a comma', () => {
    expect(buildBoxShadowValue([LAYER, { ...LAYER, offsetX: 0 }])).toBe('2px 4px 8px 0px rgba(0,0,0,0.5), 0px 4px 8px 0px rgba(0,0,0,0.5)');
  });

  it('returns "none" for an empty layer list', () => {
    expect(buildBoxShadowValue([])).toBe('none');
  });
});

describe('buildBoxShadowDeclaration', () => {
  it('wraps the value in a box-shadow declaration', () => {
    expect(buildBoxShadowDeclaration([LAYER])).toBe('box-shadow: 2px 4px 8px 0px rgba(0,0,0,0.5);');
  });
});
