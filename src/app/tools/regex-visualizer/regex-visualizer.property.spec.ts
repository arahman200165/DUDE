import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { buildRegexDiagram } from './regex-diagram';

const safePattern = fc.array(fc.constantFrom('a', 'b', '0', '1'), { minLength: 1, maxLength: 24 }).map((chars) => chars.join(''));

describe('buildRegexDiagram properties', () => {
  it('never throws for arbitrary pattern and flags', () => {
    neverThrows(([pattern, flags]) => buildRegexDiagram(pattern, flags), fc.tuple(fc.string(), fc.string()));
  });

  it('builds a diagram for safe literal patterns', () => {
    invariant((pattern) => buildRegexDiagram(pattern, ''), safePattern, (result) => result.ok && result.diagram !== undefined);
  });
});
