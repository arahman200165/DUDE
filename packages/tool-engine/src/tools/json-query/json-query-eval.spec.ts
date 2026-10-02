import { evaluateQuery } from "./json-query-eval.js";

describe('evaluateQuery', () => {
  const data = JSON.stringify({ store: { book: [{ title: 'A', price: 10 }, { title: 'B', price: 20 }] } });

  it('evaluates a JSONPath query', () => {
    const result = evaluateQuery(data, '$.store.book[*].title', 'jsonpath');
    expect(result).toEqual({ ok: true, output: JSON.stringify(['A', 'B'], null, 2) });
  });

  it('evaluates a JMESPath query', () => {
    const result = evaluateQuery(data, 'store.book[*].title', 'jmespath');
    expect(result).toEqual({ ok: true, output: JSON.stringify(['A', 'B'], null, 2) });
  });

  it('rejects empty JSON input', () => {
    expect(evaluateQuery('', '$.a', 'jsonpath').ok).toBe(false);
  });

  it('rejects an empty query', () => {
    expect(evaluateQuery(data, '', 'jsonpath').ok).toBe(false);
    expect(evaluateQuery(data, '   ', 'jmespath').ok).toBe(false);
  });

  it('reports a parse error for malformed JSON', () => {
    const result = evaluateQuery('{"a": }', '$.a', 'jsonpath');
    expect(result.ok).toBe(false);
  });

  it('reports a query error for an invalid JMESPath expression', () => {
    const result = evaluateQuery(data, 'store.book[', 'jmespath');
    expect(result.ok).toBe(false);
  });

  it('returns an empty match array for a JSONPath query that matches nothing', () => {
    const result = evaluateQuery(data, '$.nonexistent', 'jsonpath');
    expect(result).toEqual({ ok: true, output: JSON.stringify([], null, 2) });
  });
});
