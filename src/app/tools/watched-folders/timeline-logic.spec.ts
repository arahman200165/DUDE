import type { ChangeEvent } from '../../../shared-logic/fs/watch-types';
import { describeEvent, groupByDay, signedBytes, timelineToCsv } from './timeline-logic';

const event = (overrides: Partial<ChangeEvent>): ChangeEvent => ({ seq: 1, at: '2026-09-28T10:00:00.000Z', kind: 'modified', path: 'a.txt', ...overrides });

describe('watched folder timeline logic', () => {
  it('groups newest-first events by day and describes each kind', () => {
    const groups = groupByDay([event({ seq: 3 }), event({ seq: 2 }), event({ seq: 1, at: '2026-09-27T23:59:00.000Z' })]);
    expect(groups.map((group) => [group.day, group.events.length])).toEqual([['2026-09-28', 2], ['2026-09-27', 1]]);
    expect(describeEvent(event({ kind: 'renamed', from: 'old.txt', path: 'new.txt' }))).toBe('old.txt → new.txt');
    expect(describeEvent(event({ kind: 'created', path: 'dir', isDir: true }))).toBe('dir/');
    expect(describeEvent(event({ kind: 'dude', count: 4, message: undefined }))).toBe('DUDE batch operation (4 paths)');
  });

  it('formats size deltas and exports CSV', () => {
    const format = (bytes: number) => `${bytes} B`;
    expect(signedBytes(5, format)).toBe('+5 B');
    expect(signedBytes(-5, format)).toBe('−5 B');
    expect(signedBytes(0, format)).toBe('');
    expect(timelineToCsv([event({ path: 'a,b.txt', size: 3, sizeDelta: 1 })]).split('\n')[1]).toBe('2026-09-28T10:00:00.000Z,modified,"a,b.txt",,3,1,');
  });
});
