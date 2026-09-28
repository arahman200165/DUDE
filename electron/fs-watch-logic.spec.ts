import { describe, expect, it } from 'vitest';
import { classify, isNoise, shouldNotify, summarize } from './fs-watch-logic';

const file = (size: number, mtimeMs = 1) => ({ size, mtimeMs, isDir: false });

describe('watch event classification', () => {
  it('turns coalesced observations into created, modified, deleted and renamed events', () => {
    const events = classify([
      { path: 'new.txt', now: file(5), known: null, renamed: true },
      { path: 'edit.txt', now: file(9, 50), known: file(4, 1), renamed: false },
      { path: 'same.txt', now: file(4, 1), known: file(4, 1), renamed: false },
      { path: 'gone.txt', now: null, known: file(3), renamed: true },
      { path: 'old/name.md', now: null, known: file(7), renamed: true },
      { path: 'new/name.md', now: file(7), known: null, renamed: true },
    ]);
    expect(events).toEqual([
      { kind: 'modified', path: 'edit.txt', size: 9, sizeDelta: 5 },
      { kind: 'deleted', path: 'gone.txt', size: 3, sizeDelta: -3 },
      { kind: 'renamed', path: 'new/name.md', from: 'old/name.md', size: 7 },
      { kind: 'created', path: 'new.txt', size: 5 },
    ]);
  });

  it('pairs a never-seen file that vanished with the single file that appeared beside it as a rename', () => {
    expect(classify([
      { path: 'keep.txt', now: null, known: null, renamed: true },
      { path: 'kept.txt', now: file(4), known: null, renamed: true },
      { path: 'other/x.txt', now: file(1), known: null, renamed: true },
    ])).toEqual([{ kind: 'renamed', path: 'kept.txt', from: 'keep.txt', size: 4 }, { kind: 'created', path: 'other/x.txt', size: 1 }]);
  });

  it('reports a first-seen change to an existing file as modified, and ignores folder timestamp noise', () => {
    expect(classify([{ path: 'a.log', now: file(10), known: null, renamed: false }])).toEqual([{ kind: 'modified', path: 'a.log', size: 10 }]);
    expect(classify([{ path: 'dir', now: { size: 0, mtimeMs: 9, isDir: true }, known: { size: 0, mtimeMs: 1, isDir: true }, renamed: false }])).toEqual([]);
  });

  it('filters DUDE temp files and excluded segments, rate-limits notifications, and summarizes', () => {
    const excluded = (_path: string, name: string) => name === 'node_modules';
    expect(isNoise('src/.dude-tmp-1234-a.txt', excluded)).toBe(true);
    expect(isNoise('app/node_modules/x/y.js', excluded)).toBe(true);
    expect(isNoise('src/app.ts', excluded)).toBe(false);
    expect(shouldNotify(undefined, 0, 5)).toBe(true);
    expect(shouldNotify(0, 4 * 60_000, 5)).toBe(false);
    expect(shouldNotify(0, 5 * 60_000, 5)).toBe(true);
    expect(summarize([{ kind: 'created', path: 'a' }, { kind: 'created', path: 'b' }, { kind: 'deleted', path: 'c' }])).toBe('2 created, 1 deleted');
  });
});
