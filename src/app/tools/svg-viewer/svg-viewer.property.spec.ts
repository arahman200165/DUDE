import fc from 'fast-check';
import { describe, it } from 'vitest';
import { neverThrows, invariant } from '../../../testing/property-harness';
import { formatSvg, minifySvg, optimizeSvg, type SvgOptimizeResult, type SvgTextResult } from './svg-tools';

function assertWellShapedTextResult(result: unknown): void {
  const r = result as SvgTextResult;
  if (typeof r.ok !== 'boolean') throw new Error('expected an { ok } result');
  if (r.ok && typeof r.output !== 'string') throw new Error('expected string output on success');
  if (!r.ok && typeof r.error !== 'string') throw new Error('expected string error on failure');
}

describe('svg-tools property tests', () => {
  it('formatSvg never throws for arbitrary text', () => {
    neverThrows(formatSvg, fc.string({ maxLength: 500 }), { assertShape: assertWellShapedTextResult });
  });

  it('minifySvg never throws for arbitrary text', () => {
    neverThrows(minifySvg, fc.string({ maxLength: 500 }), { assertShape: assertWellShapedTextResult });
  });

  it('optimizeSvg never throws for arbitrary text', () => {
    neverThrows(optimizeSvg, fc.string({ maxLength: 500 }), {
      assertShape: (result) => {
        const r = result as SvgOptimizeResult;
        if (typeof r.ok !== 'boolean') throw new Error('expected an { ok } result');
        if (r.ok && (typeof r.output !== 'string' || typeof r.originalBytes !== 'number' || typeof r.optimizedBytes !== 'number')) {
          throw new Error('expected well-shaped success output');
        }
      },
    });
  });

  it('minifySvg output never contains whitespace between tags when it succeeds', () => {
    invariant(minifySvg, fc.string({ maxLength: 500 }), (result) => !result.ok || !/>\s+</.test(result.output));
  });
});
