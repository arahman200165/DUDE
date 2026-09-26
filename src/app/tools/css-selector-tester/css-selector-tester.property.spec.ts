import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { testSelector } from './css-selector-tester-logic';

describe('testSelector property', () => {
  it('reports every generated .item in document order with its matched count', () => {
    invariant(
      (count: number) => testSelector(`<ul>${Array.from({ length: count }, (_, i) => `<li class="item" data-index="${i}">v${i}</li>`).join('')}</ul>`, '.item'),
      fc.integer({ min: 0, max: 25 }),
      (result, count) => result.ok && result.matchCount === count && result.elements.length === count + 1 &&
        result.elements.slice(1).every((element, i) => element.tag === 'li' && element.depth === 1 && element.matched && element.attributes[0]?.value === String(i)),
    );
  });

  it('returns a typed result for arbitrary HTML and selector text', () => {
    neverThrows(
      ([html, selector]: [string, string]) => testSelector(html, selector),
      fc.tuple(fc.string(), fc.string()),
      { assertShape: (result) => {
        if (typeof result !== 'object' || result === null || !('ok' in result)) throw new Error('Expected selector result.');
        const value = result as { ok: unknown; elements?: unknown; matchCount?: unknown; error?: unknown };
        if (value['ok'] === true) {
          expect(Array.isArray(value['elements'])).toBe(true);
          expect(typeof value['matchCount']).toBe('number');
        } else {
          expect(typeof value['error']).toBe('string');
        }
      } },
    );
  });
});
