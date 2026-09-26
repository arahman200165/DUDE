import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { formatHtml, type HtmlFormatMode } from './html-format-logic';

const textArb = fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'), { minLength: 1, maxLength: 24 }).map((chars) => chars.join(''));
const modeArb = fc.constantFrom<HtmlFormatMode>('pretty', 'minify');

describe('formatHtml property', () => {
  it('preserves generated paragraph text and structure in both output modes', () => {
    invariant(
      ([texts, mode]: [readonly string[], HtmlFormatMode]) => formatHtml(`<section>${texts.map((text) => `<p>${text}</p>`).join('\n')}</section>`, mode),
      fc.tuple(fc.array(textArb, { minLength: 1, maxLength: 20 }), modeArb),
      (result, [texts]) => {
        if (!result.ok) return false;
        const parsed = document.createElement('div');
        parsed.innerHTML = result.output;
        return parsed.querySelectorAll('section > p').length === texts.length &&
          Array.from(parsed.querySelectorAll('section > p')).every((paragraph, index) => paragraph.textContent === texts[index]);
      },
    );
  });

  it('returns a typed result for arbitrary HTML text', () => {
    neverThrows((html: string) => formatHtml(html, 'pretty'), fc.string(), {
      assertShape: (result) => {
        if (typeof result !== 'object' || result === null || !('ok' in result)) throw new Error('Expected formatter result.');
        const value = result as { ok: unknown; output?: unknown; error?: unknown };
        if (value['ok'] === true) expect(typeof value['output']).toBe('string');
        else expect(typeof value['error']).toBe('string');
      },
    });
  });
});
