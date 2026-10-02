import { generateJsonPatch } from "./json-patch-generate-transform.js";

describe('generateJsonPatch', () => {
  it('generates a replace operation for a changed value', () => {
    const result = generateJsonPatch('{"a":1}', '{"a":2}');

    expect(result).toEqual({ ok: true, output: JSON.stringify([{ op: 'replace', path: '/a', value: 2 }], null, 2) });
  });

  it('generates an add operation for a new key', () => {
    const result = generateJsonPatch('{"a":1}', '{"a":1,"b":2}');

    expect(result).toEqual({ ok: true, output: JSON.stringify([{ op: 'add', path: '/b', value: 2 }], null, 2) });
  });

  it('generates a remove operation for a deleted key', () => {
    const result = generateJsonPatch('{"a":1,"b":2}', '{"a":1}');

    expect(result).toEqual({ ok: true, output: JSON.stringify([{ op: 'remove', path: '/b' }], null, 2) });
  });

  it('produces an empty patch for identical documents', () => {
    const result = generateJsonPatch('{"a":1}', '{"a":1}');

    expect(result).toEqual({ ok: true, output: '[]' });
  });

  it('rejects empty before or after input', () => {
    expect(generateJsonPatch('', '{}').ok).toBe(false);
    expect(generateJsonPatch('{}', '   ').ok).toBe(false);
  });

  it('reports which side failed to parse', () => {
    const beforeError = generateJsonPatch('{"a": }', '{}');
    expect(beforeError.ok).toBe(false);
    expect(!beforeError.ok && beforeError.error.message.startsWith('before JSON is invalid')).toBe(true);

    const afterError = generateJsonPatch('{}', '{"a": }');
    expect(afterError.ok).toBe(false);
    expect(!afterError.ok && afterError.error.message.startsWith('after JSON is invalid')).toBe(true);
  });
});
