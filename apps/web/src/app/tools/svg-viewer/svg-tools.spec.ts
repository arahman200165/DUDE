import { describe, expect, it } from 'vitest';
import { formatSvg, minifySvg, optimizeSvg } from './svg-tools';

const SAMPLE = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><!-- a comment --><rect x="0" y="0" width="10" height="10"/></svg>';

describe('formatSvg', () => {
  it('rejects empty input', () => {
    const result = formatSvg('');
    expect(result.ok).toBe(false);
  });

  it('rejects malformed markup', () => {
    const result = formatSvg('<svg><rect></svg>');
    expect(result.ok).toBe(false);
  });

  it('indents nested elements onto their own lines', () => {
    const result = formatSvg(SAMPLE);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const lines = result.output.split('\n');
      expect(lines.length).toBeGreaterThan(1);
      expect(lines[0]).toContain('<svg');
      expect(lines.some((line) => line.trim().startsWith('<rect'))).toBe(true);
    }
  });
});

describe('minifySvg', () => {
  it('collapses whitespace between tags', () => {
    const result = minifySvg(SAMPLE);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output).not.toContain('\n');
      expect(result.output).not.toMatch(/>\s+</);
    }
  });
});

describe('optimizeSvg', () => {
  it('rejects empty input', () => {
    const result = optimizeSvg('');
    expect(result.ok).toBe(false);
  });

  it('optimizes valid SVG and reports a smaller or equal byte size', () => {
    const verbose = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><!-- comment --><rect x="0" y="0" width="10" height="10" fill="#ff0000"/></svg>';
    const result = optimizeSvg(verbose);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.optimizedBytes).toBeLessThanOrEqual(result.originalBytes);
      expect(result.output).not.toContain('<!--');
    }
  });
});
