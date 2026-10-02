import { computeSelectionMetrics, computeTextMetrics } from "./text-metrics.js";

describe('computeTextMetrics', () => {
  it('returns all zeros for empty text', () => {
    const metrics = computeTextMetrics('');

    expect(metrics).toEqual({
      characterCount: 0,
      codePointCount: 0,
      wordCount: 0,
      lineCount: 0,
      byteCount: 0,
      whitespaceCount: 0,
    });
  });

  it('counts characters, words, and whitespace for simple ASCII text', () => {
    const metrics = computeTextMetrics('hello world');

    expect(metrics.characterCount).toBe(11);
    expect(metrics.codePointCount).toBe(11);
    expect(metrics.wordCount).toBe(2);
    expect(metrics.lineCount).toBe(1);
    expect(metrics.byteCount).toBe(11);
    expect(metrics.whitespaceCount).toBe(1);
  });

  it('counts lines across LF, CRLF, and CR line endings', () => {
    expect(computeTextMetrics('a\nb\r\nc\rd').lineCount).toBe(4);
  });

  it('treats astral code points (e.g. emoji) as one code point but two UTF-16 characters', () => {
    const metrics = computeTextMetrics('😀');

    expect(metrics.characterCount).toBe(2);
    expect(metrics.codePointCount).toBe(1);
    expect(metrics.byteCount).toBe(4);
  });

  it('does not double count trailing/leading whitespace as words', () => {
    expect(computeTextMetrics('  hello   world  ').wordCount).toBe(2);
  });
});

describe('computeSelectionMetrics', () => {
  it('returns null when there is no selection', () => {
    expect(computeSelectionMetrics('hello world', 4, 4)).toBeNull();
  });

  it('computes metrics for only the selected substring', () => {
    const metrics = computeSelectionMetrics('hello world', 0, 5);

    expect(metrics).not.toBeNull();
    expect(metrics?.characterCount).toBe(5);
    expect(metrics?.wordCount).toBe(1);
  });
});
