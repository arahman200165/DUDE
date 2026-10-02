import { evaluateYamlPath } from "./yaml-path-eval.js";

describe('evaluateYamlPath', () => {
  const yaml = 'store:\n  book:\n    - title: A\n    - title: B\n';

  it('evaluates a JSONPath query against parsed YAML', () => {
    const result = evaluateYamlPath(yaml, '$.store.book[*].title', 'jsonpath');

    expect(result).toEqual({ ok: true, output: JSON.stringify(['A', 'B'], null, 2) });
  });

  it('evaluates a JMESPath query against parsed YAML', () => {
    const result = evaluateYamlPath(yaml, 'store.book[*].title', 'jmespath');

    expect(result).toEqual({ ok: true, output: JSON.stringify(['A', 'B'], null, 2) });
  });

  it('rejects empty YAML input', () => {
    expect(evaluateYamlPath('', '$.a', 'jsonpath').ok).toBe(false);
  });

  it('rejects empty query input', () => {
    expect(evaluateYamlPath(yaml, '', 'jsonpath').ok).toBe(false);
    expect(evaluateYamlPath(yaml, '   ', 'jmespath').ok).toBe(false);
  });

  it('reports a parse error for malformed YAML', () => {
    const result = evaluateYamlPath('a: [1,2\n', '$.a', 'jsonpath');

    expect(result.ok).toBe(false);
  });

  it('reports an error for a malformed JMESPath query', () => {
    const result = evaluateYamlPath(yaml, 'store.book[', 'jmespath');

    expect(result.ok).toBe(false);
  });
});
