import type { WalkEntry } from "./fs-types.js";
import { extensionOf, pruneNodes, SizeAggregator } from "@dude/tool-engine/shared/fs/size-aggregate";

const DAY = 86_400_000;
const now = 1_000 * DAY;
const file = (path: string, size: number, ageDays = 1): WalkEntry => ({ path, kind: 'file', size, mtimeMs: now - ageDays * DAY, depth: path.split('/').length - 1 });
const dir = (path: string): WalkEntry => ({ path, kind: 'dir', size: 0, mtimeMs: now, depth: path.split('/').length - 1 });

describe('SizeAggregator', () => {
  it('rolls sizes and counts up to every ancestor and summarizes by extension, age, and largest file', () => {
    const aggregator = new SizeAggregator(now, 2);
    for (const entry of [dir('a'), dir('a/b'), file('a/b/big.iso', 1000, 400), file('a/b/c.txt', 10), file('a/d.TXT', 20, 10), file('root.md', 5), { ...dir('x'), kind: 'link' as const }]) aggregator.add(entry);
    const report = aggregator.finish();
    const node = (path: string) => report.nodes.find((item) => item.path === path)!;
    expect(report).toMatchObject({ totalBytes: 1035, totalFiles: 4, totalDirs: 2, links: 1 });
    expect(node('')).toMatchObject({ size: 1035, files: 4, dirs: 2, ownBytes: 5, ownFiles: 1 });
    expect(node('a')).toMatchObject({ size: 1030, files: 3, dirs: 1, ownBytes: 20 });
    expect(node('a/b')).toMatchObject({ size: 1010, files: 2, dirs: 0 });
    expect(report.largestFiles.map((item) => item.path)).toEqual(['a/b/big.iso', 'a/d.TXT']);
    expect(report.byExtension[0]).toEqual({ extension: 'iso', bytes: 1000, files: 1 });
    expect(report.byExtension.find((bucket) => bucket.extension === 'txt')).toEqual({ extension: 'txt', bytes: 30, files: 2 });
    expect(report.byAge.find((bucket) => bucket.label === '< 1 week')?.files).toBe(2);
    expect(report.byAge.find((bucket) => bucket.label === '< 3 years')?.bytes).toBe(1000);
  });

  it('creates missing ancestors for files seen before their folders', () => {
    const aggregator = new SizeAggregator(now);
    aggregator.add(file('deep/er/x.bin', 7));
    expect(aggregator.finish().nodes.find((node) => node.path === 'deep')?.size).toBe(7);
  });
});

describe('pruneNodes', () => {
  it('folds tiny deep folders into their parent without breaking the tree', () => {
    const nodes = [
      { path: '', size: 1_000_000, files: 0, dirs: 0, ownBytes: 0, ownFiles: 0, hiddenDirs: 0, hiddenBytes: 0 },
      { path: 'a', size: 999_000, files: 0, dirs: 0, ownBytes: 0, ownFiles: 0, hiddenDirs: 0, hiddenBytes: 0 },
      { path: 'a/b', size: 999_000, files: 0, dirs: 0, ownBytes: 0, ownFiles: 0, hiddenDirs: 0, hiddenBytes: 0 },
      { path: 'a/b/c', size: 999_000, files: 0, dirs: 0, ownBytes: 0, ownFiles: 0, hiddenDirs: 0, hiddenBytes: 0 },
      { path: 'a/b/c/big', size: 900_000, files: 0, dirs: 0, ownBytes: 0, ownFiles: 0, hiddenDirs: 0, hiddenBytes: 0 },
      { path: 'a/b/c/tiny', size: 1, files: 0, dirs: 0, ownBytes: 0, ownFiles: 0, hiddenDirs: 0, hiddenBytes: 0 },
    ];
    const { kept, pruned } = pruneNodes(nodes, 1_000_000, 100);
    expect(kept.map((node) => node.path).sort()).toEqual(['', 'a', 'a/b', 'a/b/c', 'a/b/c/big']);
    expect(kept.find((node) => node.path === 'a/b/c')).toMatchObject({ hiddenDirs: 1, hiddenBytes: 1 });
    expect(pruned).toBe(1);
  });

  it('reads extensions case-insensitively and ignores dotfiles', () => {
    expect(extensionOf('a/B.JPG')).toBe('jpg');
    expect(extensionOf('.gitignore')).toBe('');
    expect(extensionOf('Makefile')).toBe('');
  });
});
