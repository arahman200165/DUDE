import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { CspDirective, buildCsp, checkCspWarnings, parseCsp } from "@dude/tool-engine/tools/csp-builder/csp";

const tokenArb = fc.string({ minLength: 1 }).filter((s) => !/[\s;]/.test(s));
const directiveArb: fc.Arbitrary<CspDirective> = fc.record({
  name: tokenArb,
  values: fc.array(tokenArb, { maxLength: 5 }),
});
const directivesArb = fc.array(directiveArb, { maxLength: 5 });

describe('csp fuzzing', () => {
  it('parseCsp never throws for arbitrary text', () => {
    neverThrows((raw: string) => parseCsp(raw), fc.string(), {
      assertShape: (result) => {
        if (!Array.isArray(result)) throw new Error('expected an array');
      },
    });
  });

  it('buildCsp never throws for arbitrary directives', () => {
    neverThrows((directives: readonly CspDirective[]) => buildCsp(directives), directivesArb, {
      assertShape: (result) => {
        if (typeof result !== 'string') throw new Error('expected a string');
      },
    });
  });

  it('round-trips whitespace/semicolon-free directives through parseCsp', () => {
    invariant(buildCsp, directivesArb, (result, directives) => {
      const reparsed = parseCsp(result);
      return JSON.stringify(reparsed) === JSON.stringify(directives);
    });
  });

  it('checkCspWarnings never throws and stays within a bound of 3 warnings per directive', () => {
    invariant(
      checkCspWarnings,
      directivesArb,
      (result, directives) => Array.isArray(result) && result.length <= directives.length * 3,
    );
  });
});
