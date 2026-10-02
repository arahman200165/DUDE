import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { formatCss } from "@dude/tool-engine/tools/css-formatter/css-format-logic";

describe('css-formatter properties', () => {
  it('minification is idempotent for successfully formatted CSS', () => invariant((input: string) => formatCss(input, 'minify'), fc.string({ minLength: 1, maxLength: 500 }), (result) => {
    if (!result.ok) return true;
    const repeated = formatCss(result.output, 'minify');
    return repeated.ok && repeated.output === result.output;
  }));
  it('returns a result for arbitrary text in either mode', () => neverThrows(([input, mode]: [string, 'pretty' | 'minify']) => formatCss(input, mode), fc.tuple(fc.string({ maxLength: 500 }), fc.constantFrom('pretty' as const, 'minify' as const)), { assertShape: (result) => { if (typeof result !== 'object' || result === null || !('ok' in result)) throw new Error('Expected format result'); } }));
});
