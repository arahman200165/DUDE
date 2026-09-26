import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import {
  CorsHeaders,
  EMPTY_CORS,
  PreflightRequest,
  buildCorsHeaderText,
  evaluatePreflight,
  parseCorsHeaderText,
} from './cors-headers';

const singleLineText = fc.string().filter((s) => !s.includes('\n')).map((s) => s.trim());

const corsArb: fc.Arbitrary<CorsHeaders> = fc.record({
  allowOrigin: singleLineText,
  allowMethods: singleLineText,
  allowHeaders: singleLineText,
  allowCredentials: fc.boolean(),
  maxAge: singleLineText,
  exposeHeaders: singleLineText,
});

const preflightArb: fc.Arbitrary<PreflightRequest> = fc.record({
  origin: fc.string(),
  method: fc.string(),
  headers: fc.string(),
});

describe('cors-headers fuzzing', () => {
  it('parseCorsHeaderText never throws for arbitrary text', () => {
    neverThrows((raw: string) => parseCorsHeaderText(raw), fc.string(), {
      assertShape: (result) => {
        if (typeof (result as CorsHeaders).allowOrigin !== 'string') throw new Error('expected CorsHeaders');
      },
    });
  });

  it('buildCorsHeaderText never throws and round-trips single-line field values', () => {
    invariant(buildCorsHeaderText, corsArb, (result, cors) => {
      if (typeof result !== 'string') return false;
      return parseCorsHeaderText(result).allowOrigin === cors.allowOrigin || cors.allowOrigin === '';
    });
  });

  it('EMPTY_CORS builds to an empty string', () => {
    if (buildCorsHeaderText(EMPTY_CORS) !== '') throw new Error('expected an empty header block for EMPTY_CORS');
  });

  it('evaluatePreflight never throws and always returns reasons iff not allowed', () => {
    neverThrows(
      (input: { cors: CorsHeaders; request: PreflightRequest }) => evaluatePreflight(input.cors, input.request),
      fc.record({ cors: corsArb, request: preflightArb }),
      {
        assertShape: (result) => {
          const r = result as { allowed: boolean; reasons: readonly string[] };
          if (r.allowed !== (r.reasons.length === 0)) throw new Error('allowed must be exactly (reasons.length === 0)');
        },
      },
    );
  });
});
