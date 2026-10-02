import * as git from 'isomorphic-git';
import type { FsClient } from 'isomorphic-git';
import { computeLineDiff, DiffResult } from "../diff/text-diff.js";

/**
 * Read-only git operations for the Git Diff tool, built on `isomorphic-git`
 * against the in-memory `fs` from `git-fs-shim.ts`. `isomorphic-git` has no
 * built-in "diff two commits" — its own docs' recommended pattern is
 * `walk` + `TREE`, which this reuses instead of manually recursing trees.
 */

export interface CommitSummary {
  readonly oid: string;
  readonly message: string;
  readonly author: string;
  readonly timestamp: number;
}

export async function listCommits(fs: FsClient, dir: string, ref = 'HEAD', depth = 50): Promise<readonly CommitSummary[]> {
  const commits = await git.log({ fs, dir, ref, depth });
  return commits.map((entry) => ({
    oid: entry.oid,
    message: entry.commit.message.split('\n')[0],
    author: entry.commit.author.name,
    timestamp: entry.commit.author.timestamp * 1000,
  }));
}

export type FileChangeStatus = 'added' | 'removed' | 'modified';

export interface FileChange {
  readonly path: string;
  readonly status: FileChangeStatus;
}

export async function diffCommitFiles(fs: FsClient, dir: string, oidA: string, oidB: string): Promise<readonly FileChange[]> {
  const results = await git.walk({
    fs,
    dir,
    trees: [git.TREE({ ref: oidA }), git.TREE({ ref: oidB })],
    map: async (filepath, [a, b]) => {
      if (filepath === '.') return undefined;

      const aType = a ? await a.type() : undefined;
      const bType = b ? await b.type() : undefined;
      if (aType === 'tree' || bType === 'tree') return undefined;

      const aOid = a ? await a.oid() : null;
      const bOid = b ? await b.oid() : null;
      if (aOid === bOid) return undefined;

      if (!a) return { path: filepath, status: 'added' as const };
      if (!b) return { path: filepath, status: 'removed' as const };
      return { path: filepath, status: 'modified' as const };
    },
  });

  return (results as (FileChange | undefined)[]).filter((change): change is FileChange => !!change);
}

async function readBlobText(fs: FsClient, dir: string, oid: string, filepath: string): Promise<string | null> {
  try {
    const { blob } = await git.readBlob({ fs, dir, oid, filepath });
    return new TextDecoder().decode(blob);
  } catch {
    return null;
  }
}

export async function diffFileContent(fs: FsClient, dir: string, oidA: string, oidB: string, filepath: string): Promise<DiffResult> {
  const [before, after] = await Promise.all([
    readBlobText(fs, dir, oidA, filepath),
    readBlobText(fs, dir, oidB, filepath),
  ]);
  return computeLineDiff(before ?? '', after ?? '');
}
