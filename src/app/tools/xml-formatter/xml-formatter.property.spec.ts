import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant } from '../../../testing/property-harness';
import { processXml } from './xml-format';

describe('XML formatter properties', () => {
  it('keeps generated text content valid through format and minify', () => {
    invariant((text) => processXml(`<root>${text.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</root>`, 'format', 2), fc.string({ maxLength: 30 }), (formatted) => {
      expect(formatted.ok).toBe(true);
      return formatted.ok && processXml(formatted.output, 'validate', 2).ok;
    });
  });
});
