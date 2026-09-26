import fc from 'fast-check';
import { describe, it } from 'vitest';
import { neverThrows, invariant } from '../../../testing/property-harness';
import { sanitizeEditorHtml } from './rich-text-export';

/**
 * `sanitizeEditorHtml` is a one-directional DOMPurify pass (see rich-text-export.ts and
 * rich-text-editor.pipeline-step.ts) — there is no paired parse/serialize function in this tool's
 * pure core to round-trip against, so this is FUZZ-style coverage (neverThrows + invariants)
 * rather than the ROUNDTRIP recipe originally assigned.
 */
describe('rich-text-editor property tests', () => {
  it('sanitizeEditorHtml never throws on arbitrary HTML-ish text and always returns a sanitized string', () => {
    neverThrows((html: string) => sanitizeEditorHtml(html), fc.string({ maxLength: 2000 }), {
      assertShape: (result) => {
        if (typeof result !== 'string') throw new Error('expected a string');
        if (/<script/i.test(result)) throw new Error('sanitizer let a <script> tag through');
        if (/\son[a-z]+\s*=/i.test(result)) throw new Error('sanitizer let an inline event handler through');
        if (/href=["']javascript:/i.test(result)) throw new Error('sanitizer let a javascript: URL through');
      },
    });
  });

  it('sanitizing already-sanitized output is a no-op (idempotent)', () => {
    invariant(
      (html: string) => sanitizeEditorHtml(html),
      fc.string({ maxLength: 2000 }),
      (result) => sanitizeEditorHtml(result) === result,
    );
  });
});
