import { describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { FsJobEvent } from '../src/shared-logic/fs/fs-types';
import { runFsJob } from './fs-jobs';
import './fs-job-kinds';

vi.mock('electron', () => ({}));
const runtime = { userData: tmpdir(), attributeHelper: 'missing.exe' };

export async function runJob(kind: string, root: string, params: unknown, signal = new AbortController().signal) {
  const events: FsJobEvent[] = [];
  await runFsJob('j1', kind, root, params, signal, runtime, (event) => events.push(event));
  return events;
}

describe('fs job runner', () => {
  it('streams walk entries in batches and ends with result then done', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dude-job-'));
    for (let index = 0; index < 1200; index++) writeFileSync(join(root, `f${index}.txt`), 'x');
    const events = await runJob('walk', root, { options: {} });
    const items = events.flatMap((event) => (event.type === 'batch' ? event.items : []));
    expect(items).toHaveLength(1200);
    expect(events.filter((event) => event.type === 'batch').length).toBeGreaterThan(1);
    expect(events.at(-2)).toMatchObject({ type: 'result', data: { stats: { files: 1200 } } });
    expect(events.at(-1)).toEqual({ jobId: 'j1', type: 'done' });
  });

  it('hashes a file (and a byte range) in streaming chunks, matching Node crypto', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dude-hash-'));
    const file = join(root, 'big.bin');
    const bytes = Buffer.alloc(3 * 1024 * 1024 + 17, 7);
    writeFileSync(file, bytes);
    const events = await runJob('hash-file', file, { algorithms: ['SHA-256', 'BLAKE3', 'CRC32'] });
    const result = events.find((event) => event.type === 'result') as { data: { digests: Record<string, string> } };
    expect(result.data.digests['SHA-256']).toBe(createHash('sha256').update(bytes).digest('hex'));
    const ranged = (await runJob('hash-file', file, { algorithms: ['SHA-256'], start: 10, end: 19 })).find((event) => event.type === 'result') as { data: { digests: Record<string, string> } };
    expect(ranged.data.digests['SHA-256']).toBe(createHash('sha256').update(bytes.subarray(10, 20)).digest('hex'));
  });

  it('reports unknown kinds and cancellation as errors, always followed by done', async () => {
    expect((await runJob('nope', tmpdir(), {})).map((event) => event.type)).toEqual(['error', 'done']);
    const abort = new AbortController();
    abort.abort();
    const events = await runJob('walk', mkdtempSync(join(tmpdir(), 'dude-c-')), {}, abort.signal);
    expect(events.find((event) => event.type === 'error')).toMatchObject({ message: 'Cancelled.' });
  });

  it('aggregates a real tree into a folder-size report', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dude-size-'));
    mkdirSync(join(root, 'a', 'b'), { recursive: true });
    writeFileSync(join(root, 'a', 'b', 'x.bin'), Buffer.alloc(1000));
    writeFileSync(join(root, 'a', 'y.txt'), 'hello');
    const result = (await runJob('folder-size', root, { options: { useGitignore: false } })).find((event) => event.type === 'result') as { data: { report: { totalBytes: number; nodes: { path: string; size: number }[] } } };
    expect(result.data.report.totalBytes).toBe(1005);
    expect(result.data.report.nodes.find((node) => node.path === 'a')?.size).toBe(1005);
    expect(result.data.report.nodes.find((node) => node.path === 'a/b')?.size).toBe(1000);
  });
});
