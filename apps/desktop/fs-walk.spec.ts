import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { WalkEntry, WalkIssue, WalkOptions } from "@dude/contracts/fs/fs-types";
import { DEFAULT_WALK_OPTIONS } from "@dude/tool-engine/shared/fs/walk-filter";
import { walkTree } from './fs-walk';

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'dude-walk-'));
  const file = (path: string, text = 'x') => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), text); };
  file('.gitignore', '*.log\nbuild/\n');
  file('src/app.ts', 'console.log(1)');
  file('src/app.log', 'noise');
  file('src/.gitignore', '!keep.log\n');
  file('src/keep.log', 'kept');
  file('build/out.js', 'x');
  file('node_modules/pkg/index.js', 'x');
  file('docs/a/b/c/deep.md', 'deep');
  file('.env', 'SECRET=1');
  return root;
}

async function collect(root: string, overrides: Partial<WalkOptions> = {}, includeDirs = false) {
  const entries: WalkEntry[] = [];
  const issues: WalkIssue[] = [];
  const stats = await walkTree(root, { ...DEFAULT_WALK_OPTIONS, ...overrides }, { signal: new AbortController().signal, includeDirs, onEntry: (entry) => void entries.push(entry), onIssue: (issue) => void issues.push(issue) });
  return { entries, issues, stats, paths: entries.filter((entry) => entry.kind === 'file').map((entry) => entry.path).sort() };
}

describe('walkTree', () => {
  it('honors nested .gitignore layers (deeper negation wins) and the default excludes', async () => {
    const { paths } = await collect(fixture());
    expect(paths).toEqual(['.env', '.gitignore', 'docs/a/b/c/deep.md', 'src/.gitignore', 'src/app.ts', 'src/keep.log']);
  });

  it('can turn every filter off, and applies include/exclude globs, dotfile skipping, and depth', async () => {
    const root = fixture();
    expect((await collect(root, { useGitignore: false, useDefaultExcludes: false })).paths).toContain('node_modules/pkg/index.js');
    expect((await collect(root, { include: ['*.md'] })).paths).toEqual(['docs/a/b/c/deep.md']);
    expect((await collect(root, { exclude: ['docs'] })).paths).not.toContain('docs/a/b/c/deep.md');
    expect((await collect(root, { skipDotfiles: true })).paths).toEqual(['docs/a/b/c/deep.md', 'src/app.ts', 'src/keep.log']);
    expect((await collect(root, { maxDepth: 1 })).paths).not.toContain('docs/a/b/c/deep.md');
  });

  it('reports directories when asked, with sizes, depth, and stats', async () => {
    const { entries, stats } = await collect(fixture(), {}, true);
    expect(entries.find((entry) => entry.path === 'docs/a')).toMatchObject({ kind: 'dir', depth: 1 });
    expect(entries.find((entry) => entry.path === 'src/app.ts')).toMatchObject({ kind: 'file', size: 14, depth: 1 });
    expect(stats.files).toBe(6);
    expect(stats.skipped).toBeGreaterThan(0);
  });

  it('reports links without following them by default, and follows in-root links without looping', async () => {
    const root = fixture();
    try { symlinkSync(join(root, 'docs'), join(root, 'docs-link'), 'junction'); } catch { return; }
    symlinkSync(root, join(root, 'docs', 'loop'), 'junction');
    const plain = await collect(root);
    expect(plain.entries.find((entry) => entry.path === 'docs-link')).toMatchObject({ kind: 'link', followed: false });
    expect(plain.paths).not.toContain('docs-link/a/b/c/deep.md');
    const followed = await collect(root, { followLinks: true });
    // docs/ is reached once (through either name); the loop back to root is never re-entered.
    expect(followed.paths.filter((path) => path.endsWith('deep.md'))).toHaveLength(1);
  });

  it('keeps going past unreadable subtrees and stops when cancelled', async () => {
    const missing = await collect(join(tmpdir(), 'dude-does-not-exist-xyz'));
    expect(missing.issues[0].code).toBe('ENOENT');
    const abort = new AbortController();
    abort.abort();
    await expect(walkTree(fixture(), DEFAULT_WALK_OPTIONS, { signal: abort.signal, onEntry: () => {} })).rejects.toThrow(/Cancelled/);
  });
});
