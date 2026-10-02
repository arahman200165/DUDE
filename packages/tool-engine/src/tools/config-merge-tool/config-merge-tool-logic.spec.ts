import { mergeConfigSources } from "./config-merge-tool-logic.js";

describe('mergeConfigSources', () => {
  it('merges a single JSON source', () => {
    const result = mergeConfigSources([{ format: 'json', text: '{"a": 1}' }]);
    expect(result).toEqual({ ok: true, output: JSON.stringify({ a: 1 }, null, 2) });
  });

  it('lets a later source override an earlier one', () => {
    const result = mergeConfigSources([
      { format: 'json', text: '{"a": 1, "b": 2}' },
      { format: 'json', text: '{"b": 3}' },
    ]);
    expect(result).toEqual({ ok: true, output: JSON.stringify({ a: 1, b: 3 }, null, 2) });
  });

  it('merges across different formats in order', () => {
    const result = mergeConfigSources([
      { format: 'env', text: 'FOO=base\nBAR=base' },
      { format: 'yaml', text: 'BAR: override\n' },
    ]);
    expect(result).toEqual({ ok: true, output: JSON.stringify({ FOO: 'base', BAR: 'override' }, null, 2) });
  });

  it('deep-merges nested YAML/JSON objects', () => {
    const result = mergeConfigSources([
      { format: 'yaml', text: 'db:\n  host: localhost\n  port: 5432\n' },
      { format: 'json', text: '{"db": {"port": 6543}}' },
    ]);
    expect(result).toEqual({ ok: true, output: JSON.stringify({ db: { host: 'localhost', port: 6543 } }, null, 2) });
  });

  it('treats an empty source as contributing nothing', () => {
    const result = mergeConfigSources([{ format: 'json', text: '' }, { format: 'json', text: '{"a": 1}' }]);
    expect(result).toEqual({ ok: true, output: JSON.stringify({ a: 1 }, null, 2) });
  });

  it('rejects an empty source list', () => {
    expect(mergeConfigSources([]).ok).toBe(false);
  });

  it('prefixes an error with the offending source index and format', () => {
    const result = mergeConfigSources([{ format: 'json', text: 'not json' }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Source 1 (json)');
  });
});
