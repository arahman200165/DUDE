import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FsJobEvent, MutationPlanDraft } from '../src/shared-logic/fs/fs-types';

const mock = vi.hoisted(() => ({ userData: '' }));
vi.mock('electron', () => ({
  app: { getPath: () => mock.userData, isPackaged: false },
  ipcMain: { handle: vi.fn() },
  shell: { trashItem: vi.fn() },
  dialog: {},
  BrowserWindow: { fromWebContents: () => null },
  utilityProcess: {},
}));

import { runFsJob } from './fs-jobs';
import './fs-job-kinds';
import { grantPath } from './fs-grants';
import * as engine from './fs-mutation';

const owner = { id: 1, send: vi.fn(), isDestroyed: () => false };
const sha = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');

async function job(kind: string, root: string, params: Record<string, unknown>) {
  const events: FsJobEvent[] = [];
  await runFsJob('p', kind, root, params, new AbortController().signal, { userData: mock.userData, attributeHelper: 'none' }, (event) => events.push(event));
  const error = events.find((event) => event.type === 'error') as { message: string } | undefined;
  if (error) throw new Error(error.message);
  return (events.find((event) => event.type === 'result') as { data: any }).data;
}
async function apply(plan: MutationPlanDraft) {
  const preview = await engine.registerPlan(owner, plan);
  const token = engine.issueToken(owner.id, preview.planId);
  if (!token.ok) throw new Error(token.error);
  return engine.applyPlan(owner, preview.planId, token.token);
}

describe('file split & join (engine round trip)', () => {
  let source: string;
  let out: string;
  const bytes = Buffer.from(Array.from({ length: 2500 }, (_, index) => index % 251));
  beforeEach(() => {
    mock.userData = mkdtempSync(join(tmpdir(), 'dude-split-ud-'));
    const dir = grantPath(mkdtempSync(join(tmpdir(), 'dude-split-src-')));
    source = join(dir, 'blob.bin');
    writeFileSync(source, bytes);
    grantPath(source);
    out = grantPath(mkdtempSync(join(tmpdir(), 'dude-split-out-')));
  });

  it('splits by size into numbered parts plus a sha256sum-compatible sidecar, then joins back byte-identically', async () => {
    const split = await job('plan-split', source, { outputRoot: out, mode: 'size', partSize: 1000, naming: 'numeric' });
    expect(split.parts).toBe(3);
    expect((await apply(split.plan)).applied).toBe(4);
    expect(readFileSync(join(out, 'blob.bin.001')).equals(bytes.subarray(0, 1000))).toBe(true);
    expect(readFileSync(join(out, 'blob.bin.003')).length).toBe(500);
    const sidecar = readFileSync(join(out, 'blob.bin.sha256'), 'utf8');
    expect(sidecar).toContain(`${sha(bytes.subarray(1000, 2000))}  blob.bin.002`);
    expect(sidecar).toContain(`${sha(bytes)}  blob.bin`);

    const detected = await job('detect-parts', out, {});
    expect(detected.sets).toEqual([expect.objectContaining({ base: 'blob.bin', parts: ['blob.bin.001', 'blob.bin.002', 'blob.bin.003'], total: 2500, sidecar: true })]);
    const joinOut = grantPath(mkdtempSync(join(tmpdir(), 'dude-join-out-')));
    const joined = await job('plan-join', out, { base: 'blob.bin', outputRoot: joinOut });
    expect(joined.verified).toBe(true);
    expect((await apply(joined.plan)).applied).toBe(1);
    expect(readFileSync(join(joinOut, 'blob.bin')).equals(bytes)).toBe(true);
  });

  it('refuses to join damaged or incomplete part sets', async () => {
    const split = await job('plan-split', source, { outputRoot: out, mode: 'count', parts: 3, naming: 'alpha' });
    await apply(split.plan);
    writeFileSync(join(out, 'blob.bin.ab'), 'tampered');
    await expect(job('plan-join', out, { base: 'blob.bin', outputRoot: out, outputName: 'restored.bin' })).rejects.toThrow(/does not match its checksum/);
    const gapped = grantPath(mkdtempSync(join(tmpdir(), 'dude-gap-')));
    writeFileSync(join(gapped, 'x.bin.001'), 'a');
    writeFileSync(join(gapped, 'x.bin.003'), 'c');
    await expect(job('plan-join', gapped, { base: 'x.bin', outputRoot: gapped, outputName: 'x.out' })).rejects.toThrow(/missing/);
  });

  it('splits text by lines without cutting a line and can repeat a CSV header', async () => {
    const csv = join(out, 'data.csv');
    writeFileSync(csv, 'id,name\r\n1,a\r\n2,b\r\n3,c\r\n');
    grantPath(csv);
    const target = grantPath(mkdtempSync(join(tmpdir(), 'dude-lines-')));
    const split = await job('plan-split', csv, { outputRoot: target, mode: 'lines', linesPerPart: 2, repeatHeader: true, naming: 'numbered-ext', sidecar: false });
    await apply(split.plan);
    expect(readFileSync(join(target, 'data-001.csv'), 'utf8')).toBe('id,name\r\n1,a\r\n2,b\r\n');
    expect(readFileSync(join(target, 'data-002.csv'), 'utf8')).toBe('id,name\r\n3,c\r\n');
  });

  it('will not split into a folder that already holds a part with the same name', async () => {
    writeFileSync(join(out, 'blob.bin.001'), 'existing');
    await expect(job('plan-split', source, { outputRoot: out, mode: 'size', partSize: 1000 })).rejects.toThrow(/already contains/);
  });
});
