import { extractStringsReport } from "./binary-strings-extractor-logic.js";

function ascii(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe('extractStringsReport', () => {
  it('extracts ASCII strings when includeAscii is true', () => {
    const report = extractStringsReport(ascii('\u0000hello\u0000'), { minLength: 4, includeAscii: true, includeUtf16Le: false });
    expect(report.strings).toEqual([{ offset: 1, text: 'hello', encoding: 'ascii' }]);
  });

  it('excludes ASCII strings when includeAscii is false', () => {
    const report = extractStringsReport(ascii('hello'), { minLength: 4, includeAscii: false, includeUtf16Le: false });
    expect(report.strings).toEqual([]);
  });

  it('reports the byte length', () => {
    expect(extractStringsReport(ascii('hello'), { minLength: 4, includeAscii: true, includeUtf16Le: false }).byteLength).toBe(5);
  });

  it('truncates and flags results beyond the result cap', () => {
    // Each 4-char run is separated by a NUL byte so it forms its own distinct string, not one giant run.
    const bytes: number[] = [];
    for (let i = 0; i < 6000; i++) bytes.push(0x41, 0x41, 0x41, 0x41, 0x00);
    const report = extractStringsReport(new Uint8Array(bytes), { minLength: 4, includeAscii: true, includeUtf16Le: false });
    expect(report.strings.length).toBe(5000);
    expect(report.truncated).toBe(true);
  });

  it('does not flag truncation when under the cap', () => {
    const report = extractStringsReport(ascii('hello world'), { minLength: 4, includeAscii: true, includeUtf16Le: false });
    expect(report.truncated).toBe(false);
  });
});
