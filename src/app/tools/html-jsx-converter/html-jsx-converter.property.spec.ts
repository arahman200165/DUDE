import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { htmlToJsx, jsxToHtml } from './html-jsx-logic';

const tokenArb = fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'), { minLength: 1, maxLength: 16 }).map((chars) => chars.join(''));

describe('HTML/JSX conversion property', () => {
  it('emits typed JSX with the converted class prop and generated text', () => {
    invariant(
      ({ className, text }: { readonly className: string; readonly text: string }) => htmlToJsx(`<p class="${className}">${text}</p>`),
      fc.record({ className: tokenArb, text: tokenArb }),
      (result, input) => result.ok && result.output.includes(`className="${input.className}"`) && result.output.includes(`>${input.text}</p>`),
    );
  });

  it('returns a typed result for arbitrary input in either direction', () => {
    const shape = (result: unknown): void => {
      if (typeof result !== 'object' || result === null || !('ok' in result)) throw new Error('Expected conversion result.');
      const value = result as { ok: unknown; output?: unknown; error?: unknown };
      if (value['ok'] === true) expect(typeof value['output']).toBe('string');
      else expect(typeof value['error']).toBe('string');
    };
    neverThrows((text: string) => htmlToJsx(text), fc.string(), { assertShape: shape });
    neverThrows((text: string) => jsxToHtml(text), fc.string(), { assertShape: shape });
  });
});
