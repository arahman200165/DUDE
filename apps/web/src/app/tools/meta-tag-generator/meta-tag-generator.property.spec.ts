import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from "../../../../../../tests/property-harness";
import { buildMetaTags, DEFAULT_META_SETTINGS } from "@dude/tool-engine/tools/meta-tag-generator/meta-tag-logic";

describe('meta tag generator properties', () => {
  it('never throws for arbitrary settings and returns text', () => {
    const settings = fc.record({ title: fc.string(), description: fc.string(), charset: fc.string(), viewport: fc.string(), robots: fc.string(), canonical: fc.string(), author: fc.string(), themeColor: fc.string() });
    neverThrows(buildMetaTags, settings, { assertShape: (result) => expect(typeof result).toBe('string') });
  });
  it('emits defaults as valid lines', () => {
    expect(buildMetaTags(DEFAULT_META_SETTINGS).split('\n').every((line) => line.startsWith('<meta '))).toBe(true);
  });
});
