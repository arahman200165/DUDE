import { cleanCsv } from "./csv-clean.js";

describe('cleanCsv', () => {
  it('trims cell whitespace and drops empty rows by default', () => {
    const result = cleanCsv('a, b ,c\n\n1,2,3\n , , \n', { trimCells: true, dropEmptyRows: true });

    expect(result).toEqual({ ok: true, output: 'a,b,c\n1,2,3' });
  });

  it('keeps whitespace when trimCells is disabled', () => {
    const result = cleanCsv('a, b ,c\n', { trimCells: false, dropEmptyRows: true });

    expect(result).toEqual({ ok: true, output: 'a," b ",c' });
  });

  it('keeps blank rows when dropEmptyRows is disabled', () => {
    const result = cleanCsv('a,b\n\n1,2\n', { trimCells: true, dropEmptyRows: false });

    expect(result).toEqual({ ok: true, output: 'a,b\n\n1,2\n' });
  });

  it('rejects empty input', () => {
    expect(cleanCsv('', { trimCells: true, dropEmptyRows: true }).ok).toBe(false);
  });

  it('reports an error when nothing remains after cleaning', () => {
    const result = cleanCsv(',\n', { trimCells: true, dropEmptyRows: true });

    expect(result).toEqual({ ok: false, error: { message: 'No rows remain after cleaning.' } });
  });
});
