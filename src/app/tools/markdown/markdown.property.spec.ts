import fc from 'fast-check';
import { describe, it } from 'vitest';
import { neverThrows } from '../../../testing/property-harness';
import { renderMarkdown } from './markdown-render';

describe('renderMarkdown fuzzing', () => {
  it('never throws for arbitrary text and always returns a string', () => {
    neverThrows(renderMarkdown, fc.string({ maxLength: 1000 }), {
      assertShape: (result) => {
        if (typeof result !== 'string') throw new Error('expected a string result');
      },
    });
  });

  it('never lets a raw <script> tag or a javascript: href through, even for adversarial arbitrary text', () => {
    neverThrows(renderMarkdown, fc.string({ maxLength: 1000 }), {
      assertShape: (result) => {
        const html = (result as string).toLowerCase();
        if (html.includes('<script')) throw new Error('raw <script> tag leaked through sanitization');
        if (/href\s*=\s*["']?\s*javascript:/i.test(html)) throw new Error('javascript: href leaked through sanitization');
      },
    });
  });
});
