import { alphaSuffix, countRanges, detectPartSets, partName, sizeRanges } from "./split-naming.js";

describe('split naming', () => {
  it('names parts in the three conventions', () => {
    expect(partName('backup.tar', 0, 'numeric')).toBe('backup.tar.001');
    expect(partName('backup.tar', 11, 'numeric', 4)).toBe('backup.tar.0012');
    expect(partName('log.txt', 0, 'alpha')).toBe('log.txt.aa');
    expect(partName('log.txt', 27, 'alpha')).toBe('log.txt.bb');
    expect(partName('data.csv', 2, 'numbered-ext')).toBe('data-003.csv');
    expect(partName('Makefile', 0, 'numbered-ext')).toBe('Makefile-001');
    expect(alphaSuffix(26 * 26 - 1)).toBe('zz');
  });

  it('computes byte ranges by size and by part count', () => {
    expect(sizeRanges(10, 4)).toEqual([{ start: 0, end: 4 }, { start: 4, end: 8 }, { start: 8, end: 10 }]);
    expect(countRanges(10, 3)).toEqual([{ start: 0, end: 4 }, { start: 4, end: 8 }, { start: 8, end: 10 }]);
    expect(sizeRanges(0, 4)).toEqual([{ start: 0, end: 0 }]);
  });

  it('detects part sets, their order, and gaps, without mistaking ordinary extensions for parts', () => {
    const sets = detectPartSets(['backup.tar.001', 'backup.tar.003', 'backup.tar.002', 'notes.md', 'app.py', 'log.txt.aa', 'log.txt.ab', 'data-001.csv', 'data-002.csv', 'data-004.csv', 'solo.001', 'x.ab', 'y.ab', 'x.ac']);
    expect(sets).toEqual([
      { base: 'backup.tar', naming: 'numeric', parts: ['backup.tar.001', 'backup.tar.002', 'backup.tar.003'], gaps: [] },
      { base: 'data.csv', naming: 'numbered-ext', parts: ['data-001.csv', 'data-002.csv', 'data-004.csv'], gaps: [3] },
      { base: 'log.txt', naming: 'alpha', parts: ['log.txt.aa', 'log.txt.ab'], gaps: [] },
    ]);
  });
});
