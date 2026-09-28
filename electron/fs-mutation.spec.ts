import { beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MutationOp, MutationPlanDraft } from '../src/shared-logic/fs/fs-types';

const mock = vi.hoisted(() => ({ userData: '', trashed: [] as string[] }));
vi.mock('electron', () => ({
  app: { getPath: () => mock.userData, isPackaged: false },
  ipcMain: { handle: vi.fn() },
  shell: { trashItem: vi.fn() },
  dialog: {},
  BrowserWindow: { fromWebContents: () => null },
  utilityProcess: {},
}));

import { grantPath } from './fs-grants';
import * as engine from './fs-mutation';

const owner = { id: 1, send: vi.fn(), isDestroyed: () => false };
const other = { id: 2, send: vi.fn(), isDestroyed: () => false };
let root: string;

function file(name: string, text: string): string {
  const path = join(root, name);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, text);
  return path;
}
function expectOf(path: string) { const info = statSync(path); return { size: info.size, mtimeMs: info.mtimeMs }; }
function stage(text: string): string {
  mkdirSync(engine.stagingRoot(), { recursive: true });
  const path = join(engine.stagingRoot(), `s-${Math.random().toString(36).slice(2)}`);
  writeFileSync(path, text);
  return path;
}
function draft(ops: MutationOp[]): MutationPlanDraft { return { title: 'Test', tool: 'spec', root, ops, skipped: [] }; }
async function confirmAndApply(planId: string, who = owner, options = {}) {
  const token = engine.issueToken(who.id, planId);
  if (!token.ok) throw new Error(token.error);
  return engine.applyPlan(who, planId, token.token, options);
}

beforeEach(() => {
  mock.userData = mkdtempSync(join(tmpdir(), 'dude-mut-ud-'));
  root = grantPath(mkdtempSync(join(tmpdir(), 'dude-mut-')));
  mock.trashed = [];
  engine.setTrasherForTesting(async (path) => { mock.trashed.push(path); });
});

describe('plan validation', () => {
  it('refuses paths outside granted roots, content not staged by DUDE, and renames that move folders', async () => {
    const outside = join(tmpdir(), 'dude-not-granted.txt');
    await expect(engine.registerPlan(owner, draft([{ kind: 'trash', path: outside, expect: { size: 0, mtimeMs: 0 } }]))).rejects.toThrow(/outside the granted/);
    const target = file('a.txt', 'a');
    await expect(engine.registerPlan(owner, draft([{ kind: 'write', path: target, staged: join(tmpdir(), 'evil'), expect: expectOf(target), newSize: 1 }]))).rejects.toThrow(/not staged/);
    await expect(engine.registerPlan(owner, draft([{ kind: 'rename', from: target, to: join(root, 'sub', 'a.txt'), expect: expectOf(target) }]))).rejects.toThrow(/only change a name/);
    await expect(engine.registerPlan(owner, draft([]))).rejects.toThrow(/Nothing to change/);
  });
});

describe('confirmation boundary (DUDE_PRD.md §5.2.1)', () => {
  it('never applies without a fresh, single-use token from the same window for the same plan', async () => {
    const target = file('keep.txt', 'original');
    const preview = await engine.registerPlan(owner, draft([{ kind: 'write', path: target, staged: stage('changed'), expect: expectOf(target), newSize: 7 }]));
    await expect(engine.applyPlan(owner, preview.planId, undefined)).rejects.toThrow(/Confirm/);
    await expect(engine.applyPlan(owner, preview.planId, 'forged-token')).rejects.toThrow(/expired/);
    const foreign = engine.issueToken(other.id, preview.planId);
    expect(foreign.ok).toBe(false);
    const token = engine.issueToken(owner.id, preview.planId);
    if (!token.ok) throw new Error('no token');
    await expect(engine.applyPlan(other, preview.planId, token.token)).rejects.toThrow(/expired/);
    expect(readFileSync(target, 'utf8')).toBe('original');
    // The failed attempt above consumed the token: replaying it is refused too.
    await expect(engine.applyPlan(owner, preview.planId, token.token)).rejects.toThrow(/expired/);
    expect(readFileSync(target, 'utf8')).toBe('original');
    const result = await confirmAndApply(preview.planId);
    expect(result.applied).toBe(1);
    expect(readFileSync(target, 'utf8')).toBe('changed');
    // Plans are single-use as well.
    expect(engine.issueToken(owner.id, preview.planId).ok).toBe(false);
  });

  it('expires tokens after 60 seconds', async () => {
    const target = file('t.txt', 'x');
    const preview = await engine.registerPlan(owner, draft([{ kind: 'trash', path: target, expect: expectOf(target) }]));
    const token = engine.issueToken(owner.id, preview.planId);
    if (!token.ok) throw new Error('no token');
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 61_000);
    await expect(engine.applyPlan(owner, preview.planId, token.token)).rejects.toThrow(/expired/);
    vi.restoreAllMocks();
    expect(mock.trashed).toEqual([]);
  });
});

describe('apply', () => {
  it('skips a file changed after the preview as a conflict and backs up what it overwrites', async () => {
    const changed = file('changed.txt', 'v1');
    const stable = file('stable.txt', 'v1');
    const preview = await engine.registerPlan(owner, draft([
      { kind: 'write', path: changed, staged: stage('v2'), expect: expectOf(changed), newSize: 2 },
      { kind: 'write', path: stable, staged: stage('v2'), expect: expectOf(stable), newSize: 2 },
    ]));
    writeFileSync(changed, 'edited meanwhile');
    const result = await confirmAndApply(preview.planId);
    expect(result).toMatchObject({ applied: 1, conflicts: 1 });
    expect(readFileSync(changed, 'utf8')).toBe('edited meanwhile');
    expect(readFileSync(stable, 'utf8')).toBe('v2');
    const backups = readdirSync(join(mock.userData, 'fs-backups', preview.planId));
    expect(backups).toHaveLength(1);
    expect(readdirSync(root).some((name) => name.startsWith('.dude-tmp-'))).toBe(false);
  });

  it('applies swaps, chains, and Windows case-only renames through temporary names', async () => {
    const a = file('a.txt', 'A');
    const b = file('b.txt', 'B');
    const c = file('c.txt', 'C');
    const lower = file('readme.md', 'R');
    const preview = await engine.registerPlan(owner, draft([
      { kind: 'rename', from: a, to: b, expect: expectOf(a) },
      { kind: 'rename', from: b, to: a, expect: expectOf(b) },
      { kind: 'rename', from: c, to: join(root, 'd.txt'), expect: expectOf(c) },
      { kind: 'rename', from: lower, to: join(root, 'README.md'), expect: expectOf(lower) },
    ]));
    const result = await confirmAndApply(preview.planId);
    expect(result.applied).toBe(4);
    expect(readFileSync(a, 'utf8')).toBe('B');
    expect(readFileSync(b, 'utf8')).toBe('A');
    expect(readFileSync(join(root, 'd.txt'), 'utf8')).toBe('C');
    expect(readdirSync(root)).toContain('README.md');
  });

  it('refuses a rename onto an existing, unrelated file', async () => {
    const a = file('x.txt', 'X');
    file('taken.txt', 'T');
    const preview = await engine.registerPlan(owner, draft([{ kind: 'rename', from: a, to: join(root, 'taken.txt'), expect: expectOf(a) }]));
    expect((await confirmAndApply(preview.planId)).conflicts).toBe(1);
    expect(readFileSync(join(root, 'taken.txt'), 'utf8')).toBe('T');
  });

  it('only ever deletes by moving to the Recycle Bin, and never creates over an existing file', async () => {
    const doomed = file('old.log', 'x');
    const existing = file('new.txt', 'keep');
    const preview = await engine.registerPlan(owner, draft([
      { kind: 'trash', path: doomed, expect: expectOf(doomed) },
      { kind: 'create', path: existing, staged: stage('clobber'), newSize: 7 },
      { kind: 'create', path: join(root, 'nested', 'made.txt'), staged: stage('made'), newSize: 4 },
    ]));
    const result = await confirmAndApply(preview.planId);
    expect(mock.trashed).toEqual([doomed]);
    expect(result.conflicts).toBe(1);
    expect(readFileSync(existing, 'utf8')).toBe('keep');
    expect(readFileSync(join(root, 'nested', 'made.txt'), 'utf8')).toBe('made');
  });

  it('requires an explicit no-undo acknowledgement when backups would exceed the cap', async () => {
    await engine.setSettings({ maxBackupBytes: 1 });
    const target = file('big.txt', 'more than one byte');
    const preview = await engine.registerPlan(owner, draft([{ kind: 'write', path: target, staged: stage('x'), expect: expectOf(target), newSize: 1 }]));
    expect(preview.exceedsBackupCap).toBe(true);
    const token = engine.issueToken(owner.id, preview.planId);
    if (!token.ok) throw new Error('no token');
    await expect(engine.applyPlan(owner, preview.planId, token.token)).rejects.toThrow(/no undo/);
    expect(readFileSync(target, 'utf8')).toBe('more than one byte');
    const again = await engine.registerPlan(owner, draft([{ kind: 'write', path: target, staged: stage('x'), expect: expectOf(target), newSize: 1 }]));
    const result = await confirmAndApply(again.planId, owner, { acceptNoUndo: true });
    expect(result.journal.noUndo).toBe(true);
    await engine.setSettings({ maxBackupBytes: 5 * 1024 ** 3 });
  });
});

describe('journal and undo', () => {
  it('round-trips a write + rename + create plan through a previewed, confirmed undo', async () => {
    const edited = file('edit.txt', 'before');
    const renamed = file('old-name.txt', 'R');
    const preview = await engine.registerPlan(owner, draft([
      { kind: 'write', path: edited, staged: stage('after'), expect: expectOf(edited), newSize: 5 },
      { kind: 'rename', from: renamed, to: join(root, 'new-name.txt'), expect: expectOf(renamed) },
      { kind: 'create', path: join(root, 'created.txt'), staged: stage('c'), newSize: 1 },
    ]));
    await confirmAndApply(preview.planId);
    const journal = await engine.listJournal();
    expect(journal[0]).toMatchObject({ planId: preview.planId, title: 'Test' });

    const undo = await engine.planUndo(owner, preview.planId);
    expect(undo.undoOf).toBe(preview.planId);
    expect(undo.counts).toMatchObject({ write: 1, rename: 1, trash: 1 });
    // Undo is itself behind the same confirmation boundary.
    await expect(engine.applyPlan(owner, undo.planId, undefined)).rejects.toThrow(/Confirm/);
    await confirmAndApply(undo.planId);
    expect(readFileSync(edited, 'utf8')).toBe('before');
    expect(existsSync(renamed)).toBe(true);
    expect(mock.trashed).toEqual([join(root, 'created.txt')]);
    await expect(engine.planUndo(owner, preview.planId)).rejects.toThrow(/already undone/);
  });

  it('refuses to undo over newer edits', async () => {
    const edited = file('edit2.txt', 'before');
    const preview = await engine.registerPlan(owner, draft([{ kind: 'write', path: edited, staged: stage('after'), expect: expectOf(edited), newSize: 5 }]));
    await confirmAndApply(preview.planId);
    writeFileSync(edited, 'newer work');
    await expect(engine.planUndo(owner, preview.planId)).rejects.toThrow(/Nothing to change/);
  });

  it('prunes backups past the retention window but keeps the journal', async () => {
    const edited = file('old.txt', 'before');
    const preview = await engine.registerPlan(owner, draft([{ kind: 'write', path: edited, staged: stage('after'), expect: expectOf(edited), newSize: 5 }]));
    await confirmAndApply(preview.planId);
    await engine.pruneBackups(Date.now() + 31 * 86_400_000);
    expect(existsSync(join(mock.userData, 'fs-backups', preview.planId))).toBe(false);
    const [entry] = await engine.listJournal();
    expect(entry.backupsPruned).toBe(true);
    await expect(engine.planUndo(owner, preview.planId)).rejects.toThrow(/Nothing to change/);
  });

  it('builds small main-process plans for Recycle Bin moves and text writes', async () => {
    const doomed = file('dir/a.bin', 'x');
    const trashDraft = await engine.buildTrashPlan(root, ['dir/a.bin', '../escape', 'missing.bin'], 'spec', 'Trash');
    expect(trashDraft.ops).toEqual([{ kind: 'trash', path: doomed, expect: expectOf(doomed) }]);
    expect(trashDraft.skipped.map((item) => item.reason)).toEqual(['Not inside the folder.', 'Already gone.']);
    const writeDraft = await engine.buildWriteTextPlan(root, 'TREE.md', '# tree', 'spec');
    expect(writeDraft.ops[0]).toMatchObject({ kind: 'create', newSize: 6 });
  });
});
