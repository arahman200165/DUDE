import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import * as git from 'isomorphic-git';
import nodeFs from 'node:fs';
import { buildInMemoryFs, InMemoryFile } from "./git-fs-shim.js";
import { diffCommitFiles, diffFileContent, listCommits } from "./git-diff-service.js";

/**
 * Builds a real, tiny git repo on disk via Node's real `fs` + isomorphic-
 * git (not the in-memory shim), then reads every resulting byte back into
 * an `InMemoryFile[]` the exact way the browser tool would (via a folder
 * upload) — this is the most reliable way to validate the read-only shim
 * against isomorphic-git's actual on-disk object/ref format, rather than
 * guessing at its internal `fs` call patterns.
 */

function readAllFiles(root: string): InMemoryFile[] {
  const files: InMemoryFile[] = [];

  function walk(dir: string): void {
    for (const name of readdirSync(dir)) {
      const fullPath = join(dir, name);
      if (statSync(fullPath).isDirectory()) {
        walk(fullPath);
      } else {
        const relative = fullPath.slice(root.length).split(sep).join('/');
        files.push({ path: relative, data: new Uint8Array(readFileSync(fullPath)) });
      }
    }
  }

  walk(root);
  return files;
}

describe('git-diff-service (against a real isomorphic-git repo)', () => {
  let repoDir: string;
  let firstOid: string;
  let secondOid: string;
  let thirdOid: string;

  beforeAll(async () => {
    repoDir = mkdtempSync(join(tmpdir(), 'dude-git-diff-'));
    const author = { name: 'Test', email: 'test@example.com' };

    await git.init({ fs: nodeFs, dir: repoDir, defaultBranch: 'main' });

    writeFileSync(join(repoDir, 'a.txt'), 'line one\nline two\n');
    await git.add({ fs: nodeFs, dir: repoDir, filepath: 'a.txt' });
    firstOid = await git.commit({ fs: nodeFs, dir: repoDir, message: 'Add a.txt', author });

    writeFileSync(join(repoDir, 'a.txt'), 'line one\nline TWO changed\n');
    await git.add({ fs: nodeFs, dir: repoDir, filepath: 'a.txt' });
    secondOid = await git.commit({ fs: nodeFs, dir: repoDir, message: 'Change a.txt', author });

    mkdirSync(join(repoDir, 'sub'), { recursive: true });
    writeFileSync(join(repoDir, 'sub', 'b.txt'), 'new file\n');
    await git.add({ fs: nodeFs, dir: repoDir, filepath: 'sub/b.txt' });
    thirdOid = await git.commit({ fs: nodeFs, dir: repoDir, message: 'Add sub/b.txt', author });
  });

  afterAll(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('lists commits newest-first with correct messages', async () => {
    const files = readAllFiles(repoDir);
    const fs = buildInMemoryFs(files);

    const commits = await listCommits(fs, '/', 'HEAD');

    expect(commits.map((c) => c.message)).toEqual(['Add sub/b.txt', 'Change a.txt', 'Add a.txt']);
    expect(commits[0].oid).toBe(thirdOid);
    expect(commits.every((c) => c.author === 'Test')).toBe(true);
  });

  it('diffs two commits and reports a modified file', async () => {
    const files = readAllFiles(repoDir);
    const fs = buildInMemoryFs(files);

    const changes = await diffCommitFiles(fs, '/', firstOid, secondOid);

    expect(changes).toEqual([{ path: 'a.txt', status: 'modified' }]);
  });

  it('diffs two commits and reports an added file', async () => {
    const files = readAllFiles(repoDir);
    const fs = buildInMemoryFs(files);

    const changes = await diffCommitFiles(fs, '/', secondOid, thirdOid);

    expect(changes).toEqual([{ path: 'sub/b.txt', status: 'added' }]);
  });

  it('reports no changes between a commit and itself', async () => {
    const files = readAllFiles(repoDir);
    const fs = buildInMemoryFs(files);

    expect(await diffCommitFiles(fs, '/', firstOid, firstOid)).toEqual([]);
  });

  it('produces a line diff for the changed file content', async () => {
    const files = readAllFiles(repoDir);
    const fs = buildInMemoryFs(files);

    const diff = await diffFileContent(fs, '/', firstOid, secondOid, 'a.txt');

    expect(diff.summary.removed).toBe(1);
    expect(diff.summary.added).toBe(1);
    expect(diff.lines.some((l) => l.type === 'remove' && l.text === 'line two')).toBe(true);
    expect(diff.lines.some((l) => l.type === 'add' && l.text === 'line TWO changed')).toBe(true);
  });

  it('produces an all-added line diff for a newly added file', async () => {
    const files = readAllFiles(repoDir);
    const fs = buildInMemoryFs(files);

    const diff = await diffFileContent(fs, '/', secondOid, thirdOid, 'sub/b.txt');

    expect(diff.summary.added).toBe(1);
    expect(diff.summary.removed).toBe(0);
  });
});
