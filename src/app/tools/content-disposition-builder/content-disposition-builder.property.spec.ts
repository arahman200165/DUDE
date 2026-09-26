import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { ContentDisposition, buildContentDisposition, parseContentDisposition } from './content-disposition';

const cdArb: fc.Arbitrary<ContentDisposition> = fc.record({
  type: fc.constantFrom('inline', 'attachment'),
  filename: fc.string(),
});

describe('content-disposition fuzzing', () => {
  it('parseContentDisposition never throws for arbitrary text', () => {
    neverThrows((raw: string) => parseContentDisposition(raw), fc.string(), {
      assertShape: (result) => {
        if (typeof (result as ContentDisposition).type !== 'string') throw new Error('expected a ContentDisposition');
      },
    });
  });

  it('buildContentDisposition never throws for arbitrary type/filename combinations', () => {
    neverThrows((cd: ContentDisposition) => buildContentDisposition(cd), cdArb, {
      assertShape: (result) => {
        if (typeof result !== 'string') throw new Error('expected a string');
      },
    });
  });

  it('always leads with the disposition type, and reparsing recovers it exactly', () => {
    invariant(
      buildContentDisposition,
      cdArb,
      (result, cd) => result.startsWith(cd.type) && parseContentDisposition(result).type === cd.type,
    );
  });
});
