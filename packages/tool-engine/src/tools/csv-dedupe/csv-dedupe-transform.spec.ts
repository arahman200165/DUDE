import { dedupeCsv } from "./csv-dedupe-transform.js";

describe('dedupeCsv', () => {
  it('removes full-row duplicates when no key columns are given, keeping the first occurrence', () => {
    const result = dedupeCsv('a,b\n1,2\n1,2\n3,4\n', '');

    expect(result).toEqual({ ok: true, output: 'a,b\n1,2\n3,4' });
  });

  it('dedupes by a single named key column', () => {
    const result = dedupeCsv('id,name\n1,Alice\n1,Bob\n2,Carol\n', 'id');

    expect(result).toEqual({ ok: true, output: 'id,name\n1,Alice\n2,Carol' });
  });

  it('dedupes by multiple named key columns', () => {
    const result = dedupeCsv('a,b,c\n1,x,foo\n1,x,bar\n1,y,baz\n', 'a, b');

    expect(result).toEqual({ ok: true, output: 'a,b,c\n1,x,foo\n1,y,baz' });
  });

  it('keeps rows that differ only outside the key columns as one row', () => {
    const result = dedupeCsv('a,b\n1,2\n1,3\n', 'a');

    expect(result).toEqual({ ok: true, output: 'a,b\n1,2' });
  });

  it('rejects empty input', () => {
    expect(dedupeCsv('', '').ok).toBe(false);
  });

  it('reports an error for an unknown key column', () => {
    const result = dedupeCsv('a,b\n1,2\n', 'missing');

    expect(result).toEqual({ ok: false, error: { message: 'Column "missing" was not found in the header.' } });
  });
});
