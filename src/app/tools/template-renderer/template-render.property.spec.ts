import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { buildTemplateRenderCode } from './template-render';

describe('template render code properties', () => {
  it('never throws for arbitrary templates and context text', () => {
    neverThrows(([template, context]: [string, string]) => buildTemplateRenderCode(template, context, 'runtime'), fc.tuple(fc.string(), fc.string()));
  });

  it('embeds valid JSON context in the generated EJS invocation', () => {
    invariant(
      ([template, context]: [string, unknown]) => buildTemplateRenderCode(template, JSON.stringify(context), 'runtime'),
      fc.tuple(fc.string(), fc.jsonValue()),
      (result, [template]) => result.ok && result.code.includes(JSON.stringify(template)) && result.code.startsWith('runtime\nreturn ejs.render('),
    );
  });
});
