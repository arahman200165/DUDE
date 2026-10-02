import { diffConfigFiles, parseConfig } from "./config-file-comparator-logic.js";

describe('parseConfig', () => {
  it('parses .env into a flat object', () => {
    expect(parseConfig('FOO=bar', 'env')).toEqual({ ok: true, value: { FOO: 'bar' } });
  });

  it('parses INI into a nested object', () => {
    const result = parseConfig('[section]\nkey=value\n', 'ini');
    expect(result).toEqual({ ok: true, value: { section: { key: 'value' } } });
  });

  it('parses .properties into a flat object', () => {
    expect(parseConfig('key=value', 'properties')).toEqual({ ok: true, value: { key: 'value' } });
  });
});

describe('diffConfigFiles', () => {
  it('reports no differences for identical .env files', () => {
    const result = diffConfigFiles('FOO=bar', 'FOO=bar', 'env');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.diff.summary).toEqual({ added: 0, removed: 0, changed: 0 });
  });

  it('detects a changed value in .properties files', () => {
    const result = diffConfigFiles('key=old', 'key=new', 'properties');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.diff.summary.changed).toBe(1);
  });

  it('detects an added section in INI files', () => {
    const result = diffConfigFiles('[a]\nx=1\n', '[a]\nx=1\n[b]\ny=2\n', 'ini');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.diff.summary.added).toBeGreaterThan(0);
  });

  it('prefixes a "Before:" parse error for empty properties input', () => {
    const result = diffConfigFiles('', 'key=1', 'properties');
    expect(result).toEqual({ ok: false, error: 'Before: Enter a .properties file.' });
  });
});
