import { describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FsJobEvent } from '../src/shared-logic/fs/fs-types';
import { runFsJob } from './fs-jobs';
import './fs-job-kinds';

vi.mock('electron', () => ({}));

async function run(kind: string, root: string, params: Record<string, unknown>) {
  const events: FsJobEvent[] = [];
  await runFsJob('i', kind, root, params, new AbortController().signal, { userData: tmpdir(), attributeHelper: 'none' }, (event) => events.push(event));
  const error = events.find((event) => event.type === 'error') as { message: string } | undefined;
  if (error) throw new Error(error.message);
  return { items: events.flatMap((event) => (event.type === 'batch' ? event.items : [])) as any[], data: (events.find((event) => event.type === 'result') as { data: any }).data };
}

describe('inspector jobs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dude-inspect-'));
  mkdirSync(join(dir, 'logs'));
  const lines = Array.from({ length: 2500 }, (_, index) => `line ${index + 1}${index === 1799 ? ' ERROR disk full' : ''}`);
  const text = lines.join('\r\n') + '\r\n' + 'tail without newline';
  writeFileSync(join(dir, 'logs', 'app.log'), text);

  it('builds a sparse line index (every 1000th line start) and counts an unterminated last line', async () => {
    const { data } = await run('line-index', dir, { path: 'logs/app.log' });
    expect(data.lines).toBe(2501);
    expect(data.offsets).toHaveLength(3);
    expect(data.offsets[1]).toBe(Buffer.byteLength(lines.slice(0, 1000).join('\r\n') + '\r\n'));
  });

  it('finds text with line numbers and byte offsets, and hex byte patterns across chunk edges', async () => {
    const found = await run('find-in-file', dir, { path: 'logs/app.log', pattern: 'error', regex: false });
    expect(found.items).toHaveLength(1);
    const offset = text.indexOf('ERROR');
    expect(found.items[0]).toMatchObject({ line: 1800, offset, length: 5, text: 'line 1800 ERROR disk full' });
    const big = Buffer.alloc(4 * 1024 * 1024 + 10, 0);
    big.set([0x4d, 0x5a, 0x90, 0x00], 4 * 1024 * 1024 - 2); // straddles the first 4 MiB chunk boundary
    writeFileSync(join(dir, 'blob.bin'), big);
    const hex = await run('find-in-file', dir, { path: 'blob.bin', mode: 'hex', pattern: '4D 5A 90 00' });
    expect(hex.items).toEqual([{ offset: 4 * 1024 * 1024 - 2, length: 4 }]);
    await expect(run('find-in-file', dir, { path: 'blob.bin', mode: 'hex', pattern: 'zz' })).rejects.toThrow(/hex bytes/);
  });

  it('hashes a file inside a granted folder via params.path and refuses to escape it', async () => {
    const { data } = await run('hash-file', dir, { path: 'logs/app.log', algorithms: ['SHA-256'], start: 0, end: 3 });
    expect(data.bytes).toBe(4);
    await expect(run('hash-file', dir, { path: '../outside.txt' })).rejects.toThrow(/escapes/);
  });
});
