import { describe, expect, it } from 'vitest';
import { MAX_SIDE_CHARS, oversizeMessage, summaryText } from './diff-mobile';

describe('diff mobile helpers', () => {
  it('words the summary with counts, never colour alone', () => {
    expect(summaryText(1, 1, 0)).toBe('1 added, 1 removed, 0 unchanged');
    expect(summaryText(0, 0, 3)).toBe('No differences (3 unchanged)');
  });
  it('refuses a side above the cap', () => {
    expect(oversizeMessage(MAX_SIDE_CHARS, MAX_SIDE_CHARS)).toBeNull();
    expect(oversizeMessage(MAX_SIDE_CHARS + 1, 0)).toContain('Left');
    expect(oversizeMessage(0, MAX_SIDE_CHARS + 1)).toContain('Right');
  });
});
