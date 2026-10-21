import { describe, expect, it } from 'vitest';
import { columnWidths, countLabel, decodeDelimiter, MAX_INPUT_CHARS, oversizeMessage, shownLabel, summaryLabel } from './csv-viewer-mobile';

describe('csv-viewer mobile helpers', () => {
  it('decodes only the web delimiters', () => {
    expect([',', ';', '\t'].map(decodeDelimiter)).toEqual([',', ';', '\t']);
    expect(decodeDelimiter('|')).toBeNull();
  });
  it('labels counts with singular and plural', () => {
    expect(countLabel(1, 'row')).toBe('1 row');
    expect(summaryLabel(2, 2)).toBe('2 rows, 2 columns');
    expect(shownLabel(500, 1200)).toBe('Showing 500 of 1,200 rows');
  });
  it('refuses inputs above the cap', () => {
    expect(oversizeMessage(MAX_INPUT_CHARS)).toBeNull();
    expect(oversizeMessage(MAX_INPUT_CHARS + 1)).toContain('512 KiB');
  });
  it('bounds column widths', () => {
    expect(columnWidths(['a', 'name'], [['x'.repeat(100), 'ab']])).toEqual([32, 8]);
  });
});
