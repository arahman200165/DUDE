import { describe, expect, it, vi } from 'vitest';
import iconv from 'iconv-lite';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FsJobEvent, MutationPlanDraft } from '../src/shared-logic/fs/fs-types';
import { runFsJob } from './fs-jobs';
import './fs-job-kinds';

vi.mock('electron', () => ({}));

async function run(kind: string, root: string, params: Record<string, unknown>) {
  const events: FsJobEvent[] = [];
  await runFsJob('c', kind, root, { options: { useGitignore: false }, ...params }, new AbortController().signal, { userData: mkdtempSync(join(tmpdir(), 'dude-conv-ud-')), attributeHelper: 'none' }, (event) => events.push(event));
  const error = events.find((event) => event.type === 'error') as { message: string } | undefined;
  if (error) throw new Error(error.message);
  return { items: events.flatMap((event) => (event.type === 'batch' ? event.items : [])) as any[], data: (events.find((event) => event.type === 'result') as { data: any }).data };
}

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'dude-conv-'));
  mkdirSync(join(root, 'win'));
  writeFileSync(join(root, 'unix.txt'), 'one\ntwo\n');
  writeFileSync(join(root, 'dos.txt'), 'one\r\ntwo\r\n');
  writeFileSync(join(root, 'win', 'legacy.txt'), iconv.encode('café\r\n', 'win1252'));
  writeFileSync(join(root, 'bom.txt'), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('bom\n')]));
  writeFileSync(join(root, 'wide.txt'), iconv.encode('ümlaut 日本\n', 'utf16le', { addBOM: true }));
  writeFileSync(join(root, 'bin.dat'), Buffer.from([1, 0, 2, 0]));
  return root;
}
const staged = (plan: MutationPlanDraft, root: string, name: string) => {
  const op = plan.ops.find((item) => item.kind === 'write' && item.path.slice(root.length + 1).replace(/\\/g, '/') === name) as { staged: string } | undefined;
  return op ? readFileSync(op.staged) : null;
};

describe('text converter jobs', () => {
  it('inventories encodings, BOMs and line endings, skipping binaries', async () => {
    const { items, data } = await run('text-inventory', fixture(), {});
    const byPath = new Map(items.map((item) => [item.path, item]));
    expect(byPath.get('dos.txt')).toMatchObject({ eol: 'crlf', encoding: 'utf8', bom: false });
    expect(byPath.get('win/legacy.txt')).toMatchObject({ encoding: 'win1252', eol: 'crlf' });
    expect(byPath.get('bom.txt')).toMatchObject({ encoding: 'utf8', bom: true });
    expect(byPath.get('wide.txt')).toMatchObject({ encoding: 'utf16le', bom: true });
    expect(data.binary).toBe(1);
  });

  it('plans CRLF → LF and UTF-8 re-encoding, leaving already-conforming files alone', async () => {
    const root = fixture();
    const { data } = await run('plan-convert', root, { convert: { eol: 'lf', encoding: 'utf8', bom: 'strip' } });
    const plan = data.plan as MutationPlanDraft;
    expect(staged(plan, root, 'unix.txt')).toBeNull();
    expect(staged(plan, root, 'dos.txt')!.toString()).toBe('one\ntwo\n');
    expect(staged(plan, root, 'win/legacy.txt')!.toString('utf8')).toBe('café\n');
    expect(staged(plan, root, 'bom.txt')!.toString()).toBe('bom\n');
    expect(staged(plan, root, 'wide.txt')!.toString('utf8')).toBe('ümlaut 日本\n');
    expect(plan.ops.find((op) => op.kind === 'write' && op.path.endsWith('legacy.txt'))).toMatchObject({ detail: 'win1252 → utf8, CRLF → LF' });
  });

  it('refuses a lossy conversion instead of writing it', async () => {
    const root = fixture();
    const { data } = await run('plan-convert', root, { convert: { encoding: 'win1252', eol: 'keep' }, paths: ['wide.txt'] });
    expect(data.plan.ops).toEqual([]);
    expect(data.plan.skipped[0].reason).toMatch(/can’t represent/);
  });

  it('applies per-file settings from .editorconfig files', async () => {
    const root = fixture();
    writeFileSync(join(root, '.editorconfig'), 'root = true\n[*]\nend_of_line = lf\n[win/*.txt]\nend_of_line = crlf\ncharset = latin1\n');
    const { data } = await run('plan-convert', root, { convert: { editorconfig: true } });
    const plan = data.plan as MutationPlanDraft;
    expect(staged(plan, root, 'dos.txt')!.toString()).toBe('one\ntwo\n');
    // Already CRLF, and "é" is the same byte in Windows-1252 and Latin-1, so it already conforms.
    expect(staged(plan, root, 'win/legacy.txt')).toBeNull();
    expect(staged(plan, root, 'unix.txt')).toBeNull();
  });
});
