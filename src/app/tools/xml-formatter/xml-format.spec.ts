import fc from 'fast-check';
import { processXml } from './xml-format';

describe('processXml', () => {
  it('pretty-prints with a 2-space indent', () => {
    const result = processXml('<root><a>1</a><b><c>2</c></b></root>', 'format', 2);

    expect(result).toEqual({ ok: true, output: '<root>\n  <a>1</a>\n  <b>\n    <c>2</c>\n  </b>\n</root>' });
  });

  it('pretty-prints with a tab indent', () => {
    const result = processXml('<root><a>1</a></root>', 'format', 'tab');

    expect(result).toEqual({ ok: true, output: '<root>\n\t<a>1</a>\n</root>' });
  });

  it('preserves attributes and the XML declaration when formatting', () => {
    const result = processXml('<?xml version="1.0"?><root a="1"><b>x</b></root>', 'format', 2);

    expect(result).toEqual({ ok: true, output: '<?xml version="1.0"?>\n<root a="1">\n  <b>x</b>\n</root>' });
  });

  it('minifies formatted XML', () => {
    const result = processXml('<root>\n  <a>1</a>\n  <b>\n    <c>2</c>\n  </b>\n</root>', 'minify', 2);

    expect(result).toEqual({ ok: true, output: '<root><a>1</a><b><c>2</c></b></root>' });
  });

  it('validate mode returns the original input unchanged when valid', () => {
    const input = '<root><a>1</a></root>';
    expect(processXml(input, 'validate', 2)).toEqual({ ok: true, output: input });
  });

  it('rejects empty input', () => {
    expect(processXml('', 'format', 2).ok).toBe(false);
    expect(processXml('   ', 'format', 2).ok).toBe(false);
  });

  it('reports a structured parse error with line/column for an unclosed tag', () => {
    const result = processXml('<root><a>1</a><b></root>', 'format', 2);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message.length).toBeGreaterThan(0);
      expect(result.error.line).toBeGreaterThan(0);
    }
  });

  it('rejects malformed XML in validate mode too', () => {
    const result = processXml('<root><a></root>', 'validate', 2);
    expect(result.ok).toBe(false);
  });
});

describe('fuzzing (DUDE_PRD.md §21 Phase 23 Item 5)', () => {
  it('never throws for arbitrary text input, in any mode', () => {
    fc.assert(
      fc.property(fc.string(), fc.constantFrom<'format' | 'minify' | 'validate'>('format', 'minify', 'validate'), (input, mode) => {
        expect(() => processXml(input, mode, 2)).not.toThrow();
      }),
    );
  });
});
