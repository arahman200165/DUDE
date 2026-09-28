import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FsJobEvent, MutationPlanDraft } from '../src/shared-logic/fs/fs-types';
import { runFsJob } from './fs-jobs';
import './fs-job-kinds';

vi.mock('electron', () => ({}));

async function plan(root: string, params: Record<string, unknown>): Promise<MutationPlanDraft> {
  const events: FsJobEvent[] = [];
  await runFsJob('r', 'plan-rename', root, { options: { useGitignore: false }, ...params }, new AbortController().signal, { userData: tmpdir(), attributeHelper: 'none' }, (event) => events.push(event));
  const error = events.find((event) => event.type === 'error') as { message: string } | undefined;
  if (error) throw new Error(error.message);
  return (events.find((event) => event.type === 'result') as { data: { plan: MutationPlanDraft } }).data.plan;
}

describe('plan-rename job', () => {
  const root = mkdtempSync(join(tmpdir(), 'dude-rename-'));
  mkdirSync(join(root, 'sub'));
  writeFileSync(join(root, 'IMG_1.jpg'), 'one');
  writeFileSync(join(root, 'IMG_2.jpg'), 'two');
  writeFileSync(join(root, 'sub', 'IMG_3.jpg'), 'three');
  writeFileSync(join(root, 'photo-1.jpg'), 'already here');
  writeFileSync(join(root, '.hidden-target'), 'x');
  const rel = (path: string) => path.slice(root.length + 1).replace(/\\/g, '/');

  it('builds rename ops for top-level files only unless recursive, and skips clashes with existing files', async () => {
    const draft = await plan(root, { scope: { files: true }, rename: { find: 'IMG_', replace: 'photo-' } });
    expect(draft.ops.map((op) => op.kind === 'rename' && `${rel(op.from)}→${rel(op.to)}`)).toEqual(['IMG_2.jpg→photo-2.jpg']);
    expect(draft.skipped).toEqual([{ path: 'IMG_1.jpg', reason: 'An item with this name already exists here.' }]);
    const recursive = await plan(root, { scope: { files: true, recursive: true }, rename: { find: 'IMG_', replace: 'photo-' } });
    expect(recursive.ops.map((op) => op.kind === 'rename' && rel(op.to))).toContain('sub/photo-3.jpg');
  });

  it('catches a clash with a file the walk filters hide, and fills {hash8} from real content', async () => {
    const hidden = await plan(root, { scope: { files: true }, options: { skipDotfiles: true, useGitignore: false }, rename: { mode: 'list', list: 'IMG_2.jpg -> .hidden-target' } });
    expect(hidden.ops).toEqual([]);
    expect(hidden.skipped[0].reason).toMatch(/already exists/);
    const hashed = await plan(root, { scope: { files: true }, rename: { template: '{hash8}{.ext}' }, paths: ['IMG_1.jpg'] });
    const expected = createHash('sha256').update('one').digest('hex').slice(0, 8);
    expect(hashed.ops.map((op) => op.kind === 'rename' && rel(op.to))).toEqual([`${expected}.jpg`]);
  });

  it('includes folders when asked', async () => {
    const draft = await plan(root, { scope: { files: false, dirs: true }, rename: { caseTransform: 'upper' } });
    expect(draft.ops.map((op) => op.kind === 'rename' && rel(op.to))).toEqual(['SUB']);
  });
});
