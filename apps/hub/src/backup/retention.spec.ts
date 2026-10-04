import { existsSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { listBackups, pruneBackups } from './retention.js';
import { tempRoot } from './backup-fixture.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const names = ['dude-hub-20260101T000000Z.dudebackup', 'dude-hub-20260102T000000Z.dudebackup', 'dude-hub-20260103T000000Z.dudebackup', 'dude-hub-20260104T000000Z.dudebackup'];

function folder(): string {
  const dir = tempRoot('retention');
  roots.push(dir);
  // Write in an order unrelated to the names, with mtimes that disagree with them.
  [names[2], names[0], names[3], names[1]].forEach((name, index) => {
    writeFileSync(path.join(dir, name), `backup-${index}`);
    utimesSync(path.join(dir, name), new Date(2030 - index, 0, 1), new Date(2030 - index, 0, 1));
  });
  writeFileSync(path.join(dir, 'notes.txt'), 'foreign');
  writeFileSync(path.join(dir, 'dude-hub-20250101T000000Z.dudebackup.part'), 'partial');
  writeFileSync(path.join(dir, 'dude-hub-bad.dudebackup'), 'bad');
  mkdirSync(path.join(dir, 'dude-hub-20240101T000000Z.dudebackup'));
  return dir;
}

describe('listBackups', () => {
  it('lists only matching files, newest first by the name stamp', () => {
    const dir = folder();
    const list = listBackups(dir);
    expect(list.map((x) => x.name)).toEqual([names[3], names[2], names[1], names[0]]);
    expect(list[0].size).toBeGreaterThan(0);
    expect(list[0].mtime).toBeInstanceOf(Date);
  });

  it('returns an empty list for a missing folder', () => {
    expect(listBackups(path.join(tempRoot('missing'), 'nope'))).toEqual([]);
  });
});

describe('pruneBackups', () => {
  it('keeps the newest N and ignores foreign and .part files', () => {
    const dir = folder();
    expect(pruneBackups(dir, 2)).toEqual([names[1], names[0]]);
    expect(listBackups(dir).map((x) => x.name)).toEqual([names[3], names[2]]);
    for (const kept of ['notes.txt', 'dude-hub-20250101T000000Z.dudebackup.part', 'dude-hub-bad.dudebackup']) expect(existsSync(path.join(dir, kept))).toBe(true);
    expect(pruneBackups(dir, 2)).toEqual([]);
  });

  it('never deletes the newest file and honours protect', () => {
    const dir = folder();
    expect(pruneBackups(dir, 1, { protect: [names[0]] })).toEqual([names[2], names[1]]);
    expect(listBackups(dir).map((x) => x.name)).toEqual([names[3], names[0]]);
    expect(pruneBackups(dir, 1, { protect: [names[3]] })).toEqual([names[0]]);
    expect(listBackups(dir).map((x) => x.name)).toEqual([names[3]]);
  });

  it('throws for keep below 1', () => {
    const dir = folder();
    expect(() => pruneBackups(dir, 0)).toThrow(/at least one/);
    expect(() => pruneBackups(dir, -1)).toThrow();
    expect(() => pruneBackups(dir, 1.5)).toThrow();
    expect(listBackups(dir)).toHaveLength(4);
  });
});
