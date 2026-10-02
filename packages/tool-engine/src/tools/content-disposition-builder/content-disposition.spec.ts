import { buildContentDisposition, parseContentDisposition } from "./content-disposition.js";

describe('buildContentDisposition', () => {
  it('returns just the type when there is no filename', () => {
    expect(buildContentDisposition({ type: 'inline', filename: '' })).toBe('inline');
    expect(buildContentDisposition({ type: 'attachment', filename: '' })).toBe('attachment');
  });

  it('builds only the ASCII filename param for a plain ASCII filename', () => {
    expect(buildContentDisposition({ type: 'attachment', filename: 'report.pdf' })).toBe('attachment; filename="report.pdf"');
  });

  it('adds an RFC 5987 filename* param for a non-ASCII filename', () => {
    const result = buildContentDisposition({ type: 'attachment', filename: 'été.pdf' });
    expect(result).toContain('filename="');
    expect(result).toContain("filename*=UTF-8''%C3%A9t%C3%A9.pdf");
  });

  it('escapes an embedded quote in the ASCII fallback', () => {
    expect(buildContentDisposition({ type: 'attachment', filename: 'a "quoted" name.txt' })).toBe(
      'attachment; filename="a \\"quoted\\" name.txt"',
    );
  });
});

describe('parseContentDisposition', () => {
  it('parses the RFC 6266 Section 5 EURO rates filename* example', () => {
    expect(parseContentDisposition("attachment; filename*= UTF-8''%e2%82%ac%20rates")).toEqual({
      type: 'attachment',
      filename: '\u20ac rates',
    });
  });

  it('parses a simple attachment with an ASCII filename', () => {
    expect(parseContentDisposition('attachment; filename="report.pdf"')).toEqual({ type: 'attachment', filename: 'report.pdf' });
  });

  it('parses inline with no filename', () => {
    expect(parseContentDisposition('inline')).toEqual({ type: 'inline', filename: '' });
  });

  it('prefers filename* over filename when both are present', () => {
    const result = parseContentDisposition(`attachment; filename="ete.pdf"; filename*=UTF-8''%C3%A9t%C3%A9.pdf`);
    expect(result.filename).toBe('été.pdf');
  });

  it('round-trips a non-ASCII filename through buildContentDisposition', () => {
    const original = { type: 'attachment' as const, filename: '日本語.txt' };
    expect(parseContentDisposition(buildContentDisposition(original))).toEqual(original);
  });

  it('returns a default for empty input', () => {
    expect(parseContentDisposition('')).toEqual({ type: 'attachment', filename: '' });
  });
});
