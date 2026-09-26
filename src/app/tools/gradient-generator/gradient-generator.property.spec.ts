import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant } from '../../../testing/property-harness';
import { buildGradientCss, generateGradient, type GradientOptions, type GradientType, type RadialShape } from './gradient-generator-logic';

function toHex2(n: number): string {
  return n.toString(16).padStart(2, '0');
}

const hexArb = fc
  .tuple(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }))
  .map(([r, g, b]) => `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`);

const stopArb = fc.record({ color: hexArb, position: fc.integer({ min: 0, max: 100 }) });
const optionsArb: fc.Arbitrary<GradientOptions> = fc.record({
  type: fc.constantFrom<GradientType>('linear', 'radial', 'conic'),
  angle: fc.integer({ min: 0, max: 359 }),
  shape: fc.constantFrom<RadialShape>('circle', 'ellipse'),
  stops: fc.array(stopArb, { minLength: 2, maxLength: 6 }),
});

const CSS_FUNCTION: Record<GradientType, string> = {
  linear: 'linear-gradient',
  radial: 'radial-gradient',
  conic: 'conic-gradient',
};

describe('buildGradientCss / generateGradient property', () => {
  it('produces the expected CSS gradient function shape, containing every stop color, across the option space', () => {
    invariant(
      (options: GradientOptions) => buildGradientCss(options),
      optionsArb,
      (css, options) => css.startsWith(`${CSS_FUNCTION[options.type]}(`) && css.endsWith(')') && options.stops.every((stop) => css.includes(stop.color)),
    );
  });

  it('is deterministic — the same options always produce the same CSS', () => {
    invariant(
      (options: GradientOptions) => [generateGradient(options), generateGradient(options)] as const,
      optionsArb,
      ([a, b]) => JSON.stringify(a) === JSON.stringify(b),
    );
  });

  it('rejects fewer than two stops across the option space', () => {
    invariant(
      (options: GradientOptions) => generateGradient({ ...options, stops: options.stops.slice(0, 1) }),
      optionsArb,
      (result) => result.ok === false,
    );
  });
});
