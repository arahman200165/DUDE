import { describe, expect, it, vi } from 'vitest';
import iconv from 'iconv-lite';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FsJobEvent, MutationPlanDraft } from "@dude/contracts/fs/fs-types";
import { runFsJob } from './fs-jobs';
import './fs-job-kinds';

vi.mock('electron', () => ({}));

async function run(kind: string, root: string, params: Record<string, unknown>) {
  const events: FsJobEvent[] = [];
  const userData = mkdtempSync(join(tmpdir(), 'dude-search-ud-'));
  await runFsJob('s', kind, root, { options: { useGitignore: false }, ...params }, new AbortController().signal, { userData, attributeHelper: 'none' }, (event) => events.push(event));
  const error = events.find((event) => event.type === 'error') as { message: string } | undefined;
  if (error) throw new Error(error.message);
  return { items: events.flatMap((event) => (event.type === 'batch' ? event.items : [])) as any[], data: (events.find((event) => event.type === 'result') as { data: any }).data };
}

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'dude-search-'));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'app.ts'), 'const apiUrl = "http://old";\r\nfetch(apiUrl);\r\n');
  writeFileSync(join(root, 'latin1.txt'), iconv.encode('café old\n', 'win1252'));
  writeFileSync(join(root, 'utf16.txt'), iconv.encode('old wide\n', 'utf16le', { addBOM: true }));
  writeFileSync(join(root, 'image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]));
  writeFileSync(join(root, 'empty.log'), '');
  mkdirSync(join(root, 'hollow'));
  writeFileSync(join(root, 'data.json'), '{"name":"dude","deps":{"a":1}}');
  return root;
}

describe('tree search jobs', () => {
  it('finds content matches across encodings and skips binary files', async () => {
    const root = fixture();
    const { items, data } = await run('tree-search', root, { pattern: 'old', context: 1 });
    expect(items.map((item) => item.path).sort()).toEqual(['latin1.txt', 'src/app.ts', 'utf16.txt']);
    expect(items.find((item) => item.path === 'latin1.txt')).toMatchObject({ encoding: 'win1252', matches: [{ line: 1, column: 5, text: 'café old' }] });
    expect(items.find((item) => item.path === 'utf16.txt').encoding).toBe('utf16le');
    expect(data).toMatchObject({ filesMatched: 3, total: 3, skippedBinary: 1 });
  });

  it('searches metadata: name globs, extensions, magic-byte types, and empty files/folders', async () => {
    const root = fixture();
    expect((await run('metadata-search', root, { names: ['*.ts'] })).items.map((item) => item.path)).toEqual(['src/app.ts']);
    expect((await run('metadata-search', root, { types: ['png'] })).items).toEqual([expect.objectContaining({ path: 'image.png', type: 'png' })]);
    expect((await run('metadata-search', root, { extensions: ['.JSON'] })).items.map((item) => item.path)).toEqual(['data.json']);
    expect((await run('metadata-search', root, { emptyOnly: true })).items.map((item) => `${item.kind}:${item.path}`).sort()).toEqual(['dir:hollow', 'file:empty.log']);
  });

  it('streams decoded text for structured queries', async () => {
    const { items } = await run('read-text-files', fixture(), { options: { include: ['*.json'] } });
    expect(items).toEqual([{ path: 'data.json', text: '{"name":"dude","deps":{"a":1}}' }]);
  });

  it('builds replace plans that keep each file’s encoding, BOM, and line endings, and honor skipped hunks', async () => {
    const root = fixture();
    const { data } = await run('plan-replace', root, { pattern: 'old', replacement: 'new', skip: ['utf16.txt#1:0'] });
    const plan = data.plan as MutationPlanDraft;
    const byName = new Map(plan.ops.map((op) => [op.kind === 'write' ? op.path.slice(root.length + 1).replace(/\\/g, '/') : '', op]));
    expect([...byName.keys()].sort()).toEqual(['latin1.txt', 'src/app.ts']);
    const staged = (name: string) => readFileSync((byName.get(name) as { staged: string }).staged);
    expect(staged('src/app.ts').toString('utf8')).toBe('const apiUrl = "http://new";\r\nfetch(apiUrl);\r\n');
    expect(iconv.decode(staged('latin1.txt'), 'win1252')).toBe('café new\n');
    expect(staged('latin1.txt')[3]).toBe(0xe9);
    expect(byName.get('src/app.ts')).toMatchObject({ kind: 'write', detail: '1 replacement(s), utf8', sample: { before: '1: const apiUrl = "http://old";', after: '1: const apiUrl = "http://new";' } });
  });

  it('refuses a replacement the file’s encoding cannot store', async () => {
    const { data } = await run('plan-replace', fixture(), { pattern: 'café', replacement: '日本', options: { include: ['latin1.txt'] } });
    expect(data.plan.ops).toEqual([]);
    expect(data.plan.skipped[0].reason).toMatch(/cannot store/);
  });
});
