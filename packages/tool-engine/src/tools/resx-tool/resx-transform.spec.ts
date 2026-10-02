import { buildResx, diffResx, extractTokens, mergeResx, parseResx } from "./resx-transform.js";

const SAMPLE_RESX = `<?xml version="1.0" encoding="utf-8"?>
<root>
  <data name="Greeting" xml:space="preserve">
    <value>Hello, {0}!</value>
    <comment>A greeting</comment>
  </data>
  <data name="Farewell" xml:space="preserve">
    <value>Goodbye</value>
  </data>
</root>`;

describe('parseResx', () => {
  it('parses data entries with name, value, and optional comment', () => {
    const result = parseResx(SAMPLE_RESX);

    expect(result).toEqual({
      ok: true,
      entries: [
        { name: 'Greeting', value: 'Hello, {0}!', comment: 'A greeting' },
        { name: 'Farewell', value: 'Goodbye', comment: undefined },
      ],
    });
  });

  it('parses a single data entry as a one-element list, not a bare object', () => {
    const single = '<root><data name="Only" xml:space="preserve"><value>x</value></data></root>';

    const result = parseResx(single);

    expect(result).toEqual({ ok: true, entries: [{ name: 'Only', value: 'x', comment: undefined }] });
  });

  it('rejects empty input', () => {
    expect(parseResx('').ok).toBe(false);
  });

  it('rejects XML with no <root> element', () => {
    const result = parseResx('<notroot></notroot>');

    expect(result).toEqual({ ok: false, error: { message: 'Missing <root> element.' } });
  });

  it('reports a parse error for malformed XML', () => {
    const result = parseResx('<root><data name="x"><value>unterminated</data></root>');

    expect(result.ok).toBe(false);
  });
});

describe('buildResx', () => {
  it('round-trips entries back through parseResx', () => {
    const entries = [
      { name: 'Greeting', value: 'Hello, {0}!', comment: 'A greeting' },
      { name: 'Farewell', value: 'Goodbye' },
    ];

    const xml = buildResx(entries);
    const reparsed = parseResx(xml);

    expect(reparsed).toEqual({ ok: true, entries: [entries[0], { ...entries[1], comment: undefined }] });
  });
});

describe('diffResx', () => {
  const base = [
    { name: 'a', value: '1' },
    { name: 'b', value: '2' },
    { name: 'c', value: '3' },
  ];
  const overlay = [
    { name: 'a', value: '1' },
    { name: 'b', value: '99' },
    { name: 'd', value: '4' },
  ];

  it('classifies unchanged, changed, removed, and added entries', () => {
    const result = diffResx(base, overlay);

    expect(result).toEqual([
      { name: 'a', status: 'unchanged', baseValue: '1', overlayValue: '1' },
      { name: 'b', status: 'changed', baseValue: '2', overlayValue: '99' },
      { name: 'c', status: 'removed', baseValue: '3' },
      { name: 'd', status: 'added', overlayValue: '4' },
    ]);
  });
});

describe('mergeResx', () => {
  it('lets overlay entries win on a matching name, preserving base order, appending new keys', () => {
    const base = [
      { name: 'a', value: '1' },
      { name: 'b', value: '2' },
    ];
    const overlay = [
      { name: 'b', value: '99' },
      { name: 'c', value: '3' },
    ];

    const result = mergeResx(base, overlay);

    expect(result).toEqual([
      { name: 'a', value: '1' },
      { name: 'b', value: '99' },
      { name: 'c', value: '3' },
    ]);
  });
});

describe('extractTokens', () => {
  it('extracts unique .NET format tokens per entry, sorted', () => {
    const entries = [
      { name: 'a', value: 'Hello {0}, you have {1} messages and {0} calls.' },
      { name: 'b', value: 'No tokens here.' },
    ];

    expect(extractTokens(entries)).toEqual([
      { name: 'a', tokens: ['{0}', '{1}'] },
      { name: 'b', tokens: [] },
    ]);
  });
});
