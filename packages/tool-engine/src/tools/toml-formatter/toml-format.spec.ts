import { processToml } from "./toml-format.js";

describe('processToml', () => {
  it('reformats valid TOML into normalized form', () => {
    const result = processToml('title="x"\n[owner]\nname="Tom"\n', 'format');

    expect(result).toEqual({ ok: true, output: 'title = "x"\n\n[owner]\nname = "Tom"\n' });
  });

  it('returns the original input unchanged in validate mode', () => {
    const input = 'title   =   "x"\n';
    const result = processToml(input, 'validate');

    expect(result).toEqual({ ok: true, output: input });
  });

  it('rejects empty input', () => {
    expect(processToml('', 'format').ok).toBe(false);
    expect(processToml('   ', 'validate').ok).toBe(false);
  });

  it('reports a parse error for malformed TOML', () => {
    const result = processToml('a = [1,2\n', 'format');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message.length > 0).toBe(true);
  });

  it('reports a parse error in validate mode too', () => {
    const result = processToml('a = [1,2\n', 'validate');

    expect(result.ok).toBe(false);
  });
});
