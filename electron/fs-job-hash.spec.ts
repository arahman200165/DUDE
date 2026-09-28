import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FsJobEvent } from '../src/shared-logic/fs/fs-types';
import { formatGnu, merkleHash, parseManifest, type ManifestEntry } from '../src/shared-logic/fs/manifest-format';
import { runFsJob } from './fs-jobs';
import './fs-job-kinds';

vi.mock('electron', () => ({}));

function tree(): string {
  const root = mkdtempSync(join(tmpdir(), 'dude-hash-tree-'));
  mkdirSync(join(root, 'sub', 'empty'), { recursive: true });
  writeFileSync(join(root, 'a.txt'), 'alpha');
  writeFileSync(join(root, 'sub', 'b.bin'), Buffer.alloc(2 * 1024 * 1024 + 3, 9));
  return root;
}
const sha = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

async function run(kind: string, root: string, params: unknown, userData = mkdtempSync(join(tmpdir(), 'dude-ud-'))) {
  const events: FsJobEvent[] = [];
  await runFsJob('j', kind, root, params, new AbortController().signal, { userData, attributeHelper: 'none' }, (event) => events.push(event));
  const items = events.flatMap((event) => (event.type === 'batch' ? event.items : []));
  const result = events.find((event) => event.type === 'result') as { data: Record<string, any> } | undefined;
  const error = events.find((event) => event.type === 'error');
  if (error) throw new Error((error as { message: string }).message);
  return { items, data: result!.data, userData };
}

describe('hash-manifest job', () => {
  it('streams digests that match Node crypto and a Merkle hash that ignores timestamps', async () => {
    const root = tree();
    const { items, data } = await run('hash-manifest', root, { algorithms: ['SHA-256', 'MD5'], options: { useGitignore: false } });
    const byPath = new Map((items as ManifestEntry[]).map((entry) => [entry.path, entry]));
    expect(byPath.get('a.txt')!.digests['SHA-256']).toBe(sha('alpha'));
    expect(byPath.get('a.txt')!.digests.MD5).toBe(createHash('md5').update('alpha').digest('hex'));
    expect(byPath.get('sub/b.bin')!.digests['SHA-256']).toBe(sha(Buffer.alloc(2 * 1024 * 1024 + 3, 9)));
    const expected = merkleHash(new Map([['a.txt', sha('alpha')], ['sub/b.bin', sha(Buffer.alloc(2 * 1024 * 1024 + 3, 9))]]), ['sub', 'sub/empty']).root;
    expect(data['directoryHash']).toBe(expected);
    // The same content in a different folder (different mtimes) has the same directory hash.
    const copy = tree();
    expect((await run('hash-manifest', copy, { algorithms: ['SHA-256'], options: { useGitignore: false } })).data['directoryHash']).toBe(expected);
  });
});

describe('verify-manifest job', () => {
  it('reports ok, mismatch, missing, and unlisted files', async () => {
    const root = tree();
    const manifest = formatGnu([
      { path: 'a.txt', size: 5, mtimeMs: 0, digests: { 'SHA-256': sha('alpha') } },
      { path: 'sub/b.bin', size: 1, mtimeMs: 0, digests: { 'SHA-256': sha('wrong') } },
      { path: 'gone.txt', size: 1, mtimeMs: 0, digests: { 'SHA-256': sha('x') } },
    ], 'SHA-256');
    const { items, data } = await run('verify-manifest', root, { entries: parseManifest(manifest).entries, reportExtra: true, options: {} });
    expect(data['counts']).toMatchObject({ ok: 1, mismatch: 1, missing: 1, extra: 0 });
    writeFileSync(join(root, 'new.txt'), 'n');
    const again = await run('verify-manifest', root, { entries: parseManifest(manifest).entries, reportExtra: true, options: {} });
    expect(again.items.find((item: any) => item.status === 'extra')).toMatchObject({ path: 'new.txt' });
    expect(items.find((item: any) => item.status === 'mismatch')).toMatchObject({ path: 'sub/b.bin' });
  });
});

describe('snapshots', () => {
  it('saves a snapshot to the library and diffs it against a live rescan', async () => {
    const root = tree();
    const taken = await run('snapshot-take', root, { algorithm: 'SHA-256', label: 'before', options: { useGitignore: false } });
    expect(taken.data['header']).toMatchObject({ label: 'before', files: 2, dirs: 2, algorithm: 'SHA-256' });
    expect(readdirSync(join(taken.userData, 'snapshots')).sort()).toHaveLength(2);
    writeFileSync(join(root, 'a.txt'), 'ALPHA');
    utimesSync(join(root, 'a.txt'), new Date(), new Date(Date.now() + 10_000));
    writeFileSync(join(root, 'c.txt'), 'new');
    const diff = await run('snapshot-live-diff', root, { baseId: taken.data['header'].id, options: { useGitignore: false } }, taken.userData);
    expect(diff.data['counts']).toMatchObject({ modified: 1, added: 1, unchanged: 1 });
    expect(diff.items.map((item: any) => `${item.change}:${item.path}`).sort()).toEqual(['added:c.txt', 'modified:a.txt']);
  });
});
