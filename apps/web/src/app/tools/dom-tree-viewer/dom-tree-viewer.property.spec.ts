import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { buildDomTree } from './dom-tree-logic';

const textArb = fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'), { minLength: 1, maxLength: 24 }).map((chars) => chars.join(''));

describe('buildDomTree property', () => {
  it('keeps generated element and text nodes in the parsed tree', () => {
    invariant(
      (texts: readonly string[]) => buildDomTree(`<ul>${texts.map((text) => `<li>${text}</li>`).join('')}</ul>`),
      fc.array(textArb, { minLength: 1, maxLength: 20 }),
      (result, texts) => result.ok && result.nodes.length === 1 && result.nodes[0].label === 'ul' &&
        result.nodes[0].children?.length === texts.length &&
        result.nodes[0].children?.every((item, index) => item.label === 'li' && item.children?.length === 1 &&
          item.children[0].type === 'text' && item.children[0].valueLabel === texts[index]),
    );
  });
});

describe('buildDomTree arbitrary-input result shape', () => {
  it('returns a typed tree result for arbitrary HTML text', () => {
    neverThrows((html: string) => buildDomTree(html), fc.string(), {
      assertShape: (result) => {
        if (typeof result !== 'object' || result === null || !('ok' in result)) throw new Error('Expected DOM tree result.');
        const value = result as { ok: unknown; nodes?: unknown; error?: unknown };
        if (value['ok'] === true) expect(Array.isArray(value['nodes'])).toBe(true);
        else expect(typeof value['error']).toBe('string');
      },
    });
  });
});