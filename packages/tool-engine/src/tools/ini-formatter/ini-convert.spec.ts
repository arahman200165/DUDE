import { convertIni } from "./ini-convert.js";

describe('convertIni', () => {
  it('converts INI to pretty-printed JSON', () => {
    const result = convertIni('[owner]\nname=Tom\n', 'ini-to-json');

    expect(result).toEqual({ ok: true, output: JSON.stringify({ owner: { name: 'Tom' } }, null, 2) });
  });

  it('coerces boolean-looking INI values', () => {
    const result = convertIni('active=true\n', 'ini-to-json');

    expect(result).toEqual({ ok: true, output: JSON.stringify({ active: true }, null, 2) });
  });

  it('converts JSON to INI', () => {
    const result = convertIni('{"owner":{"name":"Tom"}}', 'json-to-ini');

    expect(result).toEqual({ ok: true, output: '[owner]\nname=Tom\n' });
  });

  it('rejects empty input for either direction', () => {
    expect(convertIni('', 'ini-to-json').ok).toBe(false);
    expect(convertIni('   ', 'json-to-ini').ok).toBe(false);
  });

  it('reports a parse error for malformed JSON', () => {
    const result = convertIni('{"a": }', 'json-to-ini');

    expect(result.ok).toBe(false);
  });

  it('rejects a non-object top-level JSON value when converting to INI', () => {
    const result = convertIni('[1,2]', 'json-to-ini');

    expect(result).toEqual({ ok: false, error: { message: 'Top-level JSON must be an object to convert to INI.' } });
  });

  it('round-trips a nested section', () => {
    const json = JSON.stringify({ section: { key: 'value' } });
    const toIni = convertIni(json, 'json-to-ini');
    expect(toIni.ok).toBe(true);

    const backToJson = toIni.ok ? convertIni(toIni.output, 'ini-to-json') : null;
    expect(backToJson).toEqual({ ok: true, output: JSON.stringify(JSON.parse(json), null, 2) });
  });
});
