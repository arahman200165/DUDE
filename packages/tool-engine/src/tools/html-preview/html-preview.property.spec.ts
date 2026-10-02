import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildBlankPreviewDoc, buildLiveHtmlPreviewDoc } from "./live-html-preview-doc.js";

describe('HTML preview document properties', () => {
  it('always returns the fixed inert blank document', () => {
    expect(buildBlankPreviewDoc()).toBe('<!DOCTYPE html><html><body></body></html>');
  });

  it('embeds arbitrary source and gives the bootstrap a string render id', () => {
    fc.assert(fc.property(fc.string(), fc.integer(), (source, id) => {
      const doc = buildLiveHtmlPreviewDoc(source, id);
      expect(doc.endsWith(`\n${source}`)).toBe(true);
      expect(doc).toContain(`var requestId = "${String(id)}";`);
      expect(doc).toContain("connect-src 'none'");
    }));
  });
});
