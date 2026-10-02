import { describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FsJobEvent } from "@dude/contracts/fs/fs-types";
import { runFsJob } from './fs-jobs';
import './fs-job-kinds';

vi.mock('electron', () => ({}));

async function duplicates(root: string, params: Record<string, unknown>) {
  const events: FsJobEvent[] = [];
  await runFsJob('d', 'duplicates', root, { options: { useGitignore: false }, ...params }, new AbortController().signal, { userData: tmpdir(), attributeHelper: 'none' }, (event) => events.push(event));
  return (events.find((event) => event.type === 'result') as { data: { groups: { files: { path: string }[]; wasted: number; identicalBytes: boolean }[]; wasted: number } }).data;
}

describe('duplicates job', () => {
  const root = mkdtempSync(join(tmpdir(), 'dude-dups-'));
  mkdirSync(join(root, 'sub'));
  const big = Buffer.alloc(300 * 1024, 7);
  const bigTwin = Buffer.from(big);
  const bigNearTwin = Buffer.from(big);
  bigNearTwin[150 * 1024] = 8; // same size, same head and tail, different middle
  writeFileSync(join(root, 'big-a.bin'), big);
  writeFileSync(join(root, 'sub', 'big-b.bin'), bigTwin);
  writeFileSync(join(root, 'big-c.bin'), bigNearTwin);
  writeFileSync(join(root, 'x.txt'), 'same');
  writeFileSync(join(root, 'sub', 'y.txt'), 'same');
  writeFileSync(join(root, 'z.txt'), 'diff');
  writeFileSync(join(root, 'crlf.md'), 'line one  \r\nline two\r\n');
  writeFileSync(join(root, 'lf.md'), 'line one\nline two');
  writeFileSync(join(root, 'empty-a'), '');
  writeFileSync(join(root, 'empty-b'), '');

  it('finds exact duplicates by size → edges → full hash, ignoring empty files and near-twins', async () => {
    const result = await duplicates(root, { mode: 'exact' });
    const sets = result.groups.map((group) => group.files.map((file) => file.path).sort());
    expect(sets).toEqual([['big-a.bin', 'sub/big-b.bin'], ['sub/y.txt', 'x.txt']]);
    expect(result.wasted).toBe(300 * 1024 + 4);
    expect((await duplicates(root, { mode: 'exact', byteCompare: true })).groups).toHaveLength(2);
    expect((await duplicates(root, { mode: 'exact', minSize: 0 })).groups).toHaveLength(3);
  });

  it('groups text files with the same normalized content in content mode', async () => {
    const result = await duplicates(root, { mode: 'content' });
    const markdown = result.groups.find((group) => group.files.some((file) => file.path === 'crlf.md'))!;
    expect(markdown.files.map((file) => file.path).sort()).toEqual(['crlf.md', 'lf.md']);
    expect(markdown.identicalBytes).toBe(false);
    expect(result.groups.find((group) => group.files.some((file) => file.path === 'x.txt'))!.identicalBytes).toBe(true);
  });
});
