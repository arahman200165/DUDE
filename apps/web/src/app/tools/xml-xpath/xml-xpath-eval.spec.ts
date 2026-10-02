import { evaluateXPath } from './xml-xpath-eval';

describe('evaluateXPath', () => {
  const xml = '<root><a>1</a><a>2</a></root>';

  it('evaluates a node-set expression, serializing each matched node', () => {
    const result = evaluateXPath(xml, '//a');

    expect(result).toEqual({ ok: true, result: { resultType: 'nodes', matches: ['<a>1</a>', '<a>2</a>'] } });
  });

  it('evaluates a number expression', () => {
    const result = evaluateXPath(xml, 'count(//a)');

    expect(result).toEqual({ ok: true, result: { resultType: 'number', matches: ['2'] } });
  });

  it('evaluates a string expression', () => {
    const result = evaluateXPath(xml, 'string(//a[1])');

    expect(result).toEqual({ ok: true, result: { resultType: 'string', matches: ['1'] } });
  });

  it('evaluates a boolean expression', () => {
    const result = evaluateXPath(xml, 'boolean(//a)');

    expect(result).toEqual({ ok: true, result: { resultType: 'boolean', matches: ['true'] } });
  });

  it('returns an attribute\'s text value rather than serializing it as an element', () => {
    const result = evaluateXPath('<root a="x"/>', '//@a');

    expect(result).toEqual({ ok: true, result: { resultType: 'nodes', matches: ['x'] } });
  });

  it('rejects empty XML or expression input', () => {
    expect(evaluateXPath('', '//a').ok).toBe(false);
    expect(evaluateXPath(xml, '   ').ok).toBe(false);
  });

  it('reports a parse error for malformed XML', () => {
    const result = evaluateXPath('<root><a>1</a>', '//a');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message.length > 0).toBe(true);
  });

  it('reports an error for an invalid XPath expression', () => {
    const result = evaluateXPath(xml, '[[[');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message.length > 0).toBe(true);
  });

  it('returns an empty match list for a node-set with no matches', () => {
    const result = evaluateXPath(xml, '//missing');

    expect(result).toEqual({ ok: true, result: { resultType: 'nodes', matches: [] } });
  });
});
