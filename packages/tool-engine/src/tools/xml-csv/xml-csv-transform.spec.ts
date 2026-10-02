import { convertXmlCsv } from "./xml-csv-transform.js";

describe('convertXmlCsv', () => {
  const xml = '<root><record><a>1</a><b>2</b></record><record><a>3</a><b>4</b></record></root>';

  it('auto-detects the record element when root has exactly one child key', () => {
    const result = convertXmlCsv(xml, 'xml-to-csv', '');

    expect(result).toEqual({ ok: true, output: 'a,b\n1,2\n3,4' });
  });

  it('handles a single record (not an array in the parsed XML)', () => {
    const result = convertXmlCsv('<root><record><a>1</a></record></root>', 'xml-to-csv', '');

    expect(result).toEqual({ ok: true, output: 'a\n1' });
  });

  it('auto-detects via the one array-valued child when root has multiple children', () => {
    const withMeta = '<root><meta>x</meta><record><a>1</a></record><record><a>2</a></record></root>';
    const result = convertXmlCsv(withMeta, 'xml-to-csv', '');

    expect(result).toEqual({ ok: true, output: 'a\n1\n2' });
  });

  it('uses an explicitly named record element', () => {
    const custom = '<root><row><a>1</a></row></root>';
    const result = convertXmlCsv(custom, 'xml-to-csv', 'row');

    expect(result).toEqual({ ok: true, output: 'a\n1' });
  });

  it('unions column names across records missing some fields', () => {
    const sparse = '<root><record><a>1</a></record><record><b>2</b></record></root>';
    const result = convertXmlCsv(sparse, 'xml-to-csv', '');

    expect(result).toEqual({ ok: true, output: 'a,b\n1,\n,2' });
  });

  it('reports an error when auto-detection is ambiguous', () => {
    const ambiguous = '<root><a>1</a><b>2</b></root>';
    const result = convertXmlCsv(ambiguous, 'xml-to-csv', '');

    expect(result).toEqual({
      ok: false,
      error: { message: 'Could not auto-detect the repeating record element — name it explicitly.' },
    });
  });

  it('reports an error for a named record element that does not exist', () => {
    const result = convertXmlCsv(xml, 'xml-to-csv', 'missing');

    expect(result).toEqual({ ok: false, error: { message: 'No "<missing>" element was found under the root.' } });
  });

  it('converts CSV to XML wrapped in <root><record>...', () => {
    const result = convertXmlCsv('a,b\n1,2\n', 'csv-to-xml', '');

    expect(result).toEqual({ ok: true, output: '<root>\n  <record>\n    <a>1</a>\n    <b>2</b>\n  </record>\n</root>' });
  });

  it('uses a custom record tag when converting CSV to XML', () => {
    const result = convertXmlCsv('a\n1\n', 'csv-to-xml', 'row');

    expect(result).toEqual({ ok: true, output: '<root>\n  <row>\n    <a>1</a>\n  </row>\n</root>' });
  });

  it('rejects empty input for either direction', () => {
    expect(convertXmlCsv('', 'xml-to-csv', '').ok).toBe(false);
    expect(convertXmlCsv('   ', 'csv-to-xml', '').ok).toBe(false);
  });

  it('reports a parse error for malformed XML', () => {
    const result = convertXmlCsv('<root><record><a>1</a></record>', 'xml-to-csv', '');

    expect(result.ok).toBe(false);
  });

  it('round-trips XML to CSV and back', () => {
    const toCsv = convertXmlCsv(xml, 'xml-to-csv', '');
    expect(toCsv.ok).toBe(true);

    const backToXml = toCsv.ok ? convertXmlCsv(toCsv.output, 'csv-to-xml', 'record') : null;
    expect(backToXml).toEqual({
      ok: true,
      output: '<root>\n  <record>\n    <a>1</a>\n    <b>2</b>\n  </record>\n  <record>\n    <a>3</a>\n    <b>4</b>\n  </record>\n</root>',
    });
  });
});
