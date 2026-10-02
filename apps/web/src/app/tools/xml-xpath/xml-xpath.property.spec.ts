import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from "../../../../../../tests/property-harness";
import { evaluateXPath } from './xml-xpath-eval';

describe('XPath evaluator properties', () => {
  it('returns a shaped result for generated XML text', () => {
    const text = fc.string({ maxLength: 20 }).map((s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;'));
    neverThrows((value) => evaluateXPath(`<root>${value}</root>`, '/root',), text, {
      assertShape: (result) => expect(typeof result).toBe('object'),
    });
  });
});
