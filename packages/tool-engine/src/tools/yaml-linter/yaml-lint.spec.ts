import { lintYaml } from "./yaml-lint.js";

describe('lintYaml', () => {
  it('reports a single valid document', () => {
    const result = lintYaml('a: 1\nb: 2\n');

    expect(result).toEqual({ ok: true, documentCount: 1 });
  });

  it('counts multiple "---"-separated documents in a stream', () => {
    const result = lintYaml('a: 1\n---\nb: 2\n');

    expect(result).toEqual({ ok: true, documentCount: 2 });
  });

  it('rejects empty input', () => {
    expect(lintYaml('').ok).toBe(false);
    expect(lintYaml('   ').ok).toBe(false);
  });

  it('reports a parse error with line and column detail', () => {
    const result = lintYaml('a: [1,2\n');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message.length > 0).toBe(true);
    expect(!result.ok && typeof result.error.line).toBe('number');
    expect(!result.ok && typeof result.error.column).toBe('number');
  });
});
