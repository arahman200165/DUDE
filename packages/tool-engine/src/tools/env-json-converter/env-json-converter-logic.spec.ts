import { convertEnvJson } from "./env-json-converter-logic.js";

describe('convertEnvJson', () => {
  it('converts .env to a JSON object', () => {
    const result = convertEnvJson('FOO=bar\nBAZ=qux', 'env-to-json');
    expect(result).toEqual({ ok: true, output: JSON.stringify({ FOO: 'bar', BAZ: 'qux' }, null, 2) });
  });

  it('converts a JSON object to .env', () => {
    const result = convertEnvJson('{"FOO": "bar", "PORT": 8080}', 'json-to-env');
    expect(result).toEqual({ ok: true, output: 'FOO=bar\nPORT=8080' });
  });

  it('rejects a JSON array', () => {
    expect(convertEnvJson('[1,2,3]', 'json-to-env').ok).toBe(false);
  });

  it('rejects a JSON object with a nested object value', () => {
    expect(convertEnvJson('{"FOO": {"nested": true}}', 'json-to-env').ok).toBe(false);
  });

  it('rejects invalid JSON', () => {
    expect(convertEnvJson('not json', 'json-to-env').ok).toBe(false);
  });

  it('rejects empty input', () => {
    expect(convertEnvJson('', 'env-to-json').ok).toBe(false);
    expect(convertEnvJson('', 'json-to-env').ok).toBe(false);
  });
});
