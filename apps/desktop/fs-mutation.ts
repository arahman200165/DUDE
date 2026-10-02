import { app, ipcMain, shell, type WebContents } from 'electron';
import { createHash, randomUUID } from 'node:crypto';
import { ConfirmationStore, digestOf, JsonJournal } from './mutation-core';
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import { once } from 'node:events';
import { basename, dirname, isAbsolute, join, normalize, sep } from 'node:path';
import type {
  ApplyResult, ByteSegment, FsResult, JournalEntry, JournalOp, MutationOp, MutationOpKind, MutationPlanDraft, MutationSettings,
  PlanPreview, Precondition, PreviewOp,
} from "@dude/contracts/fs/fs-types";
import { isInsideGrantedRoot, isRootGranted, normalizeRoot, resolveInRoot, toPosixRelative } from './fs-grants';
import { setPlanInterceptor } from './fs-jobs-bridge';

/**
 * DUDE's local mutation engine (DUDE_PRD.md §5.2.1, Phase 29 Milestone 524) — the only code path in
 * the app that changes the user's files, and the first local implementation of the
 * Destructive-Action Contract:
 *
 * 1. **Plan (preview).** Plans are built only in the main/fs utility process from validated
 *    requests; the renderer receives a preview (exact paths, sizes, diff samples) and a plan id, never
 *    raw ops it could edit. Every path must sit inside a granted root.
 * 2. **Confirm.** Applying needs a single-use token bound to the requesting window and the plan's
 *    digest, valid for 60 s, issued only by an explicit confirm gesture (`issueToken`).
 * 3. **Apply.** Each op re-checks its precondition (size + mtime captured at plan time); a file that
 *    changed since the preview is skipped as a conflict. Originals of overwritten files are backed
 *    up for undo, writes are atomic (temp + rename in the target folder), swaps/chains/case-only
 *    renames go through temporary names, and deletes only ever go to the Recycle Bin.
 * 4. **Journal + undo.** Every applied plan is journaled; undo builds an inverse plan that goes
 *    through the same preview → confirm → apply path.
 */

const PLAN_TTL_MS = 15 * 60_000;
const TOKEN_TTL_MS = 60_000;
const MAX_PENDING_TOKENS = 32;
const MAX_PLANS = 64;
const MAX_JOURNAL = 500;
const MAX_PREVIEW_OPS = 20_000;
export const DEFAULT_MUTATION_SETTINGS: MutationSettings = { retentionDays: 30, maxBackupBytes: 5 * 1024 ** 3 };

interface StoredPlan {
  readonly id: string;
  readonly ownerId: number;
  readonly draft: MutationPlanDraft;
  readonly digest: string;
  readonly expires: number;
  readonly preview: PlanPreview;
  readonly undoOf?: string;
}

const applying = new Map<string, AbortController>();
const store = new ConfirmationStore<StoredPlan>({
  tokenTtlMs: TOKEN_TTL_MS,
  maxPlans: MAX_PLANS,
  maxTokens: MAX_PENDING_TOKENS,
  isBusy: (id) => applying.has(id),
  onExpire: (plan) => { void discardStaging(plan); },
});
const journalStore = new JsonJournal<JournalEntry>(() => journalRoot(), MAX_JOURNAL);
let settings: MutationSettings = DEFAULT_MUTATION_SETTINGS;
let settingsLoaded = false;

type ApplyListener = (planId: string, paths: readonly string[]) => void;
const beforeApplyListeners: ApplyListener[] = [];
const afterApplyListeners: ApplyListener[] = [];
/** Folder watching (Milestone 534) tags events on these paths as DUDE-originated instead of alerting. */
export function onPlanApplying(before: ApplyListener, after: ApplyListener): void { beforeApplyListeners.push(before); afterApplyListeners.push(after); }

// ---- Paths ----

function userData(): string { return app.getPath('userData'); }
export function stagingRoot(): string { return join(userData(), 'fs-staging'); }
function backupsRoot(): string { return join(userData(), 'fs-backups'); }
function journalRoot(): string { return join(userData(), 'fs-journal'); }
function settingsPath(): string { return join(userData(), 'fs-mutation-settings.json'); }

function within(parent: string, child: string): boolean {
  const base = normalizeRoot(parent).toLowerCase();
  const target = normalize(child).toLowerCase();
  return target.startsWith(base.endsWith(sep) ? base : base + sep);
}

function opPaths(op: MutationOp): string[] { return op.kind === 'rename' ? [op.from, op.to] : [op.path]; }

// ---- Plan registration ----

function validateOp(op: MutationOp): void {
  for (const path of opPaths(op)) {
    if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('Plan contains an invalid path.');
    if (!isInsideGrantedRoot(path)) throw new Error(`Plan touches a path outside the granted folders: ${path}`);
    if (path.split(/[\\/]/).includes('..')) throw new Error('Plan contains a relative path segment.');
  }
  if (op.kind === 'rename' && normalizeRoot(dirname(op.from)).toLowerCase() !== normalizeRoot(dirname(op.to)).toLowerCase()) {
    throw new Error('A rename may only change a name, not move it to another folder.');
  }
  const staged = op.kind === 'write' || op.kind === 'create' ? op.staged : undefined;
  if (staged !== undefined && !within(stagingRoot(), staged) && !within(backupsRoot(), staged)) {
    throw new Error('Plan content was not staged by DUDE.');
  }
  if (op.kind === 'write' && !op.staged) throw new Error('Plan content was not staged by DUDE.');
  if (op.kind === 'create') {
    if (!op.staged && !op.segments?.length) throw new Error('Plan creates a file without content.');
    const expected = new Set((op.sources ?? []).map((source) => normalize(source.path).toLowerCase()));
    for (const segment of op.segments ?? []) {
      if (typeof segment.source !== 'string' || !isAbsolute(segment.source) || !isInsideGrantedRoot(segment.source)) throw new Error('Plan reads from a file outside the granted folders.');
      if (!expected.has(normalize(segment.source).toLowerCase())) throw new Error('Plan reads from a file without a precondition.');
      if (!Number.isSafeInteger(segment.start) || !Number.isSafeInteger(segment.end) || segment.start < 0 || segment.end < segment.start) throw new Error('Plan contains an invalid byte range.');
    }
  }
}

async function backupUsage(): Promise<number> {
  let total = 0;
  const dirs = await fs.readdir(backupsRoot()).catch(() => [] as string[]);
  for (const dir of dirs) {
    const files = await fs.readdir(join(backupsRoot(), dir)).catch(() => [] as string[]);
    for (const file of files) total += (await fs.stat(join(backupsRoot(), dir, file)).catch(() => ({ size: 0 }))).size;
  }
  return total;
}

function relativeFor(root: string, path: string): string {
  return within(root, path) ? toPosixRelative(root, path) : path;
}

function toPreviewOp(root: string, op: MutationOp, index: number): PreviewOp {
  switch (op.kind) {
    case 'rename': return { index, kind: 'rename', path: relativeFor(root, op.from), to: relativeFor(root, op.to), size: op.expect.size, detail: op.detail };
    case 'write': return { index, kind: 'write', path: relativeFor(root, op.path), size: op.expect.size, newSize: op.newSize, detail: op.detail, sample: op.sample };
    case 'create': return { index, kind: 'create', path: relativeFor(root, op.path), size: 0, newSize: op.newSize, detail: op.detail };
    case 'trash': return { index, kind: 'trash', path: relativeFor(root, op.path), size: op.expect.size, detail: op.detail };
  }
}

async function discardStaging(plan: StoredPlan): Promise<void> {
  for (const op of plan.draft.ops) if ((op.kind === 'write' || op.kind === 'create') && op.staged && within(stagingRoot(), op.staged)) await fs.rm(op.staged, { force: true }).catch(() => {});
}

export async function registerPlan(owner: Pick<WebContents, 'id'>, draft: MutationPlanDraft, undoOf?: string): Promise<PlanPreview> {
  store.sweep();
  await loadSettings();
  if (store.planCount >= MAX_PLANS) throw new Error('Too many pending previews. Apply or discard one first.');
  if (!draft || !Array.isArray(draft.ops)) throw new Error('Invalid plan.');
  if (!draft.ops.length) throw new Error(draft.skipped?.length ? `Nothing to change: all ${draft.skipped.length} candidate(s) were skipped.` : 'Nothing to change.');
  if (!isRootGranted(draft.root)) throw new Error('The folder for this plan is no longer granted. Pick it again.');
  for (const op of draft.ops) validateOp(op);
  const id = randomUUID();
  const digest = digestOf(draft.ops);
  const counts: Record<MutationOpKind, number> = { rename: 0, write: 0, create: 0, trash: 0 };
  for (const op of draft.ops) counts[op.kind as MutationOpKind]++;
  const backupBytes = draft.ops.reduce((sum, op) => sum + (op.kind === 'write' ? op.expect.size : 0), 0);
  const exceedsBackupCap = backupBytes > 0 && (await backupUsage()) + backupBytes > settings.maxBackupBytes;
  const expires = Date.now() + PLAN_TTL_MS;
  const preview: PlanPreview = {
    planId: id,
    title: String(draft.title ?? 'Batch operation').slice(0, 200),
    tool: String(draft.tool ?? ''),
    root: draft.root,
    ops: draft.ops.slice(0, MAX_PREVIEW_OPS).map((op, index) => toPreviewOp(draft.root, op, index)),
    skipped: (draft.skipped ?? []).slice(0, MAX_PREVIEW_OPS),
    counts,
    backupBytes,
    exceedsBackupCap,
    expiresAt: new Date(expires).toISOString(),
    ...(undoOf ? { undoOf } : {}),
  };
  store.addPlan({ id, ownerId: owner.id, draft, digest, expires, preview, undoOf });
  return preview;
}

// ---- Confirmation tokens ----

export function issueToken(ownerId: number, planId: string): FsResult<{ token: string; expiresAt: string }> {
  return store.issueToken(ownerId, planId);
}

// ---- Apply ----

async function statOf(path: string): Promise<Precondition | null> {
  try {
    const info = await fs.lstat(path);
    return { size: info.size, mtimeMs: info.mtimeMs };
  } catch { return null; }
}

function matches(actual: Precondition | null, expected: Precondition): boolean {
  return !!actual && actual.size === expected.size && Math.abs(actual.mtimeMs - expected.mtimeMs) < 2;
}

async function exists(path: string): Promise<boolean> { return (await statOf(path)) !== null; }

interface Content {
  readonly staged?: string;
  readonly segments?: readonly ByteSegment[];
  readonly sha256?: string;
  readonly newSize?: number;
}

/**
 * Writes the new content next to the target (staged file, then any source byte ranges), verifies
 * size and optional SHA-256, then renames over the target — readers never see a half-written file,
 * and a join whose result doesn't match its expected hash never replaces anything.
 */
async function placeAtomically(content: Content, target: string, signal?: AbortSignal): Promise<void> {
  const temp = join(dirname(target), `.dude-tmp-${randomUUID().slice(0, 8)}-${basename(target)}`);
  try {
    if (!content.segments?.length && !content.sha256) {
      await fs.copyFile(content.staged!, temp);
    } else {
      const hash = createHash('sha256');
      const out = createWriteStream(temp);
      const pipe = async (stream: NodeJS.ReadableStream) => {
        for await (const chunk of stream as AsyncIterable<Buffer>) {
          hash.update(chunk);
          if (!out.write(chunk)) await once(out, 'drain');
        }
      };
      if (content.staged) await pipe(createReadStream(content.staged, { signal }));
      for (const segment of content.segments ?? []) if (segment.end > segment.start) await pipe(createReadStream(segment.source, { start: segment.start, end: segment.end - 1, signal }));
      await new Promise<void>((resolve, reject) => out.end((error?: Error | null) => (error ? reject(error) : resolve())));
      if (content.sha256 && hash.digest('hex') !== content.sha256.toLowerCase()) throw new Error('The assembled content does not match its expected SHA-256; nothing was replaced.');
    }
    if (content.newSize !== undefined && (await fs.stat(temp)).size !== content.newSize) throw new Error('The assembled content has an unexpected size; nothing was replaced.');
    await fs.rename(temp, target);
  } catch (error) {
    await fs.rm(temp, { force: true }).catch(() => {});
    throw error;
  }
}

export type Trasher = (path: string) => Promise<void>;
let trash: Trasher = (path) => shell.trashItem(path);
export function setTrasherForTesting(value: Trasher): void { trash = value; }

interface ApplyContext {
  readonly planId: string;
  readonly signal: AbortSignal;
  readonly backupDir: string | null;
  readonly results: JournalOp[];
  progress(): void;
}

async function applyRenames(ops: readonly { op: Extract<MutationOp, { kind: 'rename' }>; index: number }[], context: ApplyContext): Promise<void> {
  const depth = (path: string) => path.split(sep).length;
  const byDepth = new Map<number, typeof ops[number][]>();
  for (const item of ops) byDepth.set(depth(item.op.from), [...(byDepth.get(depth(item.op.from)) ?? []), item]);
  // Deepest first, so renaming a folder never invalidates a pending rename inside it.
  for (const level of [...byDepth.keys()].sort((a, b) => b - a)) {
    const group = byDepth.get(level)!;
    const sources = new Set(group.map((item) => item.op.from.toLowerCase()));
    const moved: { item: typeof group[number]; temp: string }[] = [];
    for (const item of group) {
      const { op, index } = item;
      if (context.signal.aborted) { context.results[index] = { kind: 'rename', path: op.from, to: op.to, outcome: 'cancelled', expect: op.expect }; continue; }
      if (!matches(await statOf(op.from), op.expect)) { context.results[index] = { kind: 'rename', path: op.from, to: op.to, outcome: 'conflict', message: 'Changed or removed since the preview.', expect: op.expect }; continue; }
      const sameFile = op.to.toLowerCase() === op.from.toLowerCase();
      if (!sameFile && !sources.has(op.to.toLowerCase()) && (await exists(op.to))) { context.results[index] = { kind: 'rename', path: op.from, to: op.to, outcome: 'conflict', message: 'The new name already exists.', expect: op.expect }; continue; }
      const temp = join(dirname(op.from), `.dude-rn-${context.planId.slice(0, 8)}-${index}`);
      try { await fs.rename(op.from, temp); moved.push({ item, temp }); }
      catch (error) { context.results[index] = { kind: 'rename', path: op.from, to: op.to, outcome: 'failed', message: String((error as Error).message), expect: op.expect }; }
    }
    for (const { item: { op, index }, temp } of moved) {
      try {
        // A target that appeared (not one of this group's own sources) after phase 1 is a conflict too.
        if (op.to.toLowerCase() !== op.from.toLowerCase() && (await exists(op.to))) throw Object.assign(new Error('The new name already exists.'), { conflict: true });
        await fs.rename(temp, op.to);
        context.results[index] = { kind: 'rename', path: op.from, to: op.to, outcome: 'applied', after: (await statOf(op.to)) ?? undefined, expect: op.expect };
      } catch (error) {
        await fs.rename(temp, op.from).catch(() => {});
        context.results[index] = { kind: 'rename', path: op.from, to: op.to, outcome: (error as { conflict?: boolean }).conflict ? 'conflict' : 'failed', message: (error as Error).message, expect: op.expect };
      }
      context.progress();
    }
  }
}

async function applyOp(op: Exclude<MutationOp, { kind: 'rename' }>, index: number, context: ApplyContext): Promise<void> {
  const base = { kind: op.kind, path: op.path } as const;
  if (context.signal.aborted) { context.results[index] = { ...base, outcome: 'cancelled' }; return; }
  try {
    if (op.kind === 'create') {
      if (await exists(op.path)) { context.results[index] = { ...base, outcome: 'conflict', message: 'A file with this name already exists.' }; return; }
      for (const source of op.sources ?? []) {
        if (!matches(await statOf(source.path), source)) { context.results[index] = { ...base, outcome: 'conflict', message: `Source changed since the preview: ${basename(source.path)}` }; return; }
      }
      await fs.mkdir(dirname(op.path), { recursive: true });
      await placeAtomically(op, op.path, context.signal);
      context.results[index] = { ...base, outcome: 'applied', after: (await statOf(op.path)) ?? undefined };
      return;
    }
    if (!matches(await statOf(op.path), op.expect)) { context.results[index] = { ...base, outcome: 'conflict', message: 'Changed or removed since the preview.', expect: op.expect }; return; }
    if (op.kind === 'trash') {
      await trash(op.path);
      context.results[index] = { ...base, outcome: 'applied', expect: op.expect };
      return;
    }
    let backup: string | undefined;
    if (context.backupDir) {
      backup = `${index}-${basename(op.path)}`;
      await fs.mkdir(context.backupDir, { recursive: true });
      await fs.copyFile(op.path, join(context.backupDir, backup));
    }
    await placeAtomically({ staged: op.staged }, op.path);
    context.results[index] = { ...base, outcome: 'applied', expect: op.expect, backup, after: (await statOf(op.path)) ?? undefined };
  } catch (error) {
    context.results[index] = { ...base, outcome: 'failed', message: error instanceof Error ? error.message : String(error), expect: 'expect' in op ? op.expect : undefined };
  } finally {
    context.progress();
  }
}

export async function applyPlan(owner: Pick<WebContents, 'id' | 'send' | 'isDestroyed'>, planId: string, token: unknown, options: { acceptNoUndo?: boolean } = {}): Promise<ApplyResult> {
  store.sweep();
  const plan = store.consume(owner.id, planId, token);
  if (plan.preview.exceedsBackupCap && !options.acceptNoUndo) throw new Error('Backups for this plan would exceed the backup cap. Acknowledge "no undo for this plan" to apply it.');
  const noUndo = plan.preview.exceedsBackupCap && !!options.acceptNoUndo;
  store.deletePlan(planId);
  const abort = new AbortController();
  applying.set(planId, abort);
  const ops = plan.draft.ops;
  const results: JournalOp[] = ops.map((op) => ({ kind: op.kind, path: op.kind === 'rename' ? op.from : op.path, ...(op.kind === 'rename' ? { to: op.to } : {}), outcome: 'pending' }));
  let done = 0;
  const context: ApplyContext = {
    planId,
    signal: abort.signal,
    backupDir: noUndo ? null : join(backupsRoot(), planId),
    results,
    progress: () => { done++; if (!owner.isDestroyed()) owner.send('dude:fsmut:progress', { planId, done, total: ops.length }); },
  };
  const touched = ops.flatMap(opPaths);
  for (const listener of beforeApplyListeners) listener(planId, touched);
  try {
    const renames = ops.flatMap((op, index) => (op.kind === 'rename' ? [{ op, index }] : []));
    if (renames.length) await applyRenames(renames, context);
    for (let index = 0; index < ops.length; index++) {
      const op = ops[index];
      if (op.kind !== 'rename') await applyOp(op, index, context);
    }
  } finally {
    applying.delete(planId);
    for (const listener of afterApplyListeners) listener(planId, touched);
    await discardStaging(plan);
  }
  const backupBytes = results.reduce((sum, result, index) => sum + (result.backup ? (ops[index] as Extract<MutationOp, { kind: 'write' }>).expect.size : 0), 0);
  const journal: JournalEntry = {
    planId,
    title: plan.preview.title,
    tool: plan.preview.tool,
    root: plan.draft.root,
    appliedAt: new Date().toISOString(),
    ops: results,
    backupBytes,
    backupsPruned: false,
    noUndo,
    ...(plan.undoOf ? { undoOf: plan.undoOf } : {}),
  };
  await writeJournal(journal);
  if (plan.undoOf) {
    const original = await readJournal(plan.undoOf);
    if (original) await writeJournal({ ...original, undoneBy: planId });
  }
  await pruneBackups();
  const count = (outcome: string) => results.filter((result) => result.outcome === outcome).length;
  return { planId, applied: count('applied'), conflicts: count('conflict'), failed: count('failed'), cancelled: count('cancelled'), journal };
}

export function cancelApply(planId: string): boolean {
  const abort = applying.get(planId);
  abort?.abort();
  return !!abort;
}

export function discardPlan(ownerId: number, planId: string): boolean {
  const plan = store.getPlan(planId);
  if (!plan || plan.ownerId !== ownerId) return false;
  store.deletePlan(planId);
  void discardStaging(plan);
  return true;
}

// ---- Journal ----

const writeJournal = (entry: JournalEntry): Promise<void> => journalStore.write(entry);
const readJournal = (planId: string): Promise<JournalEntry | null> => journalStore.read(planId);
export const listJournal = (): Promise<JournalEntry[]> => journalStore.list();

/** The inverse of an applied plan, registered as a fresh plan (so undo is itself previewed + confirmed). */
export async function planUndo(owner: Pick<WebContents, 'id'>, planId: string): Promise<PlanPreview> {
  const entry = await readJournal(planId);
  if (!entry) throw new Error('That operation is no longer in the journal.');
  if (entry.undoneBy) throw new Error('This operation was already undone.');
  if (!isRootGranted(entry.root)) throw new Error(`Pick ${entry.root} again (or remember it) to undo this operation.`);
  const ops: MutationOp[] = [];
  const skipped: { path: string; reason: string }[] = [];
  for (const op of [...entry.ops].reverse()) {
    if (op.outcome !== 'applied') continue;
    const current = op.kind === 'rename' ? await statOf(op.to!) : await statOf(op.path);
    if (op.kind === 'trash') { skipped.push({ path: op.path, reason: 'Restore it from the Recycle Bin.' }); continue; }
    if (!op.after || !matches(current, op.after)) { skipped.push({ path: op.to ?? op.path, reason: 'Changed since the operation, so undoing it would lose newer edits.' }); continue; }
    if (op.kind === 'rename') ops.push({ kind: 'rename', from: op.to!, to: op.path, expect: op.after, detail: 'restore original name' });
    else if (op.kind === 'create') ops.push({ kind: 'trash', path: op.path, expect: op.after, detail: 'remove the created file (to the Recycle Bin)' });
    else if (op.kind === 'write') {
      if (!op.backup || entry.noUndo || entry.backupsPruned) { skipped.push({ path: op.path, reason: 'No backup of the original is kept.' }); continue; }
      const backup = join(backupsRoot(), entry.planId, op.backup);
      const info = await statOf(backup);
      if (!info) { skipped.push({ path: op.path, reason: 'The backup was pruned.' }); continue; }
      ops.push({ kind: 'write', path: op.path, staged: backup, expect: op.after, newSize: info.size, detail: 'restore the original content' });
    }
  }
  return registerPlan(owner, { title: `Undo: ${entry.title}`, tool: entry.tool, root: entry.root, ops, skipped }, entry.planId);
}

// ---- Retention ----

async function loadSettings(): Promise<void> {
  if (settingsLoaded) return;
  try { settings = sanitizeSettings(JSON.parse(await fs.readFile(settingsPath(), 'utf8'))); } catch { settings = DEFAULT_MUTATION_SETTINGS; }
  settingsLoaded = true;
}

export function sanitizeSettings(raw: unknown): MutationSettings {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<MutationSettings>;
  const days = Number(value.retentionDays);
  const bytes = Number(value.maxBackupBytes);
  return {
    retentionDays: Number.isFinite(days) ? Math.min(3650, Math.max(1, Math.round(days))) : DEFAULT_MUTATION_SETTINGS.retentionDays,
    maxBackupBytes: Number.isFinite(bytes) ? Math.min(2 ** 50, Math.max(0, Math.round(bytes))) : DEFAULT_MUTATION_SETTINGS.maxBackupBytes,
  };
}

export async function setSettings(patch: unknown): Promise<MutationSettings> {
  await loadSettings();
  settings = sanitizeSettings({ ...settings, ...(patch && typeof patch === 'object' ? patch : {}) });
  await fs.mkdir(userData(), { recursive: true });
  await fs.writeFile(settingsPath(), JSON.stringify(settings), 'utf8');
  await pruneBackups();
  return settings;
}

async function dropBackups(entry: JournalEntry): Promise<void> {
  await fs.rm(join(backupsRoot(), entry.planId), { recursive: true, force: true });
  await writeJournal({ ...entry, backupsPruned: true });
}

/** Oldest-first: past the retention window, then until total backups fit the cap. Journals stay. */
export async function pruneBackups(now = Date.now()): Promise<void> {
  await loadSettings();
  const entries = (await listJournal()).filter((entry) => entry.backupBytes > 0 && !entry.backupsPruned).reverse();
  let total = entries.reduce((sum, entry) => sum + entry.backupBytes, 0);
  for (const entry of entries) {
    const old = now - Date.parse(entry.appliedAt) > settings.retentionDays * 86_400_000;
    if (old || total > settings.maxBackupBytes) { total -= entry.backupBytes; await dropBackups(entry); }
  }
  await journalStore.trimTo(MAX_JOURNAL, (entry) => fs.rm(join(backupsRoot(), entry.planId), { recursive: true, force: true }));
}

export async function purgeBackups(planId?: string): Promise<void> {
  for (const entry of await listJournal()) if ((!planId || entry.planId === planId) && entry.backupBytes > 0 && !entry.backupsPruned) await dropBackups(entry);
}

export async function clearStaleStaging(): Promise<void> {
  await fs.rm(stagingRoot(), { recursive: true, force: true }).catch(() => {});
}

// ---- Main-process plan builders (small plans that need no utility-process scan) ----

export async function buildTrashPlan(root: string, relativePaths: unknown, tool: unknown, title: unknown): Promise<MutationPlanDraft> {
  if (!Array.isArray(relativePaths) || !relativePaths.length) throw new Error('Select something to move to the Recycle Bin.');
  const ops: MutationOp[] = [];
  const skipped: { path: string; reason: string }[] = [];
  for (const relative of relativePaths.slice(0, 100_000)) {
    const absolute = typeof relative === 'string' ? resolveInRoot(root, relative) : null;
    if (!absolute || absolute === normalizeRoot(root)) { skipped.push({ path: String(relative), reason: 'Not inside the folder.' }); continue; }
    const info = await statOf(absolute);
    if (!info) { skipped.push({ path: String(relative), reason: 'Already gone.' }); continue; }
    ops.push({ kind: 'trash', path: absolute, expect: info });
  }
  return { title: typeof title === 'string' ? title : 'Move to Recycle Bin', tool: typeof tool === 'string' ? tool : '', root: normalizeRoot(root), ops, skipped };
}

export async function buildWriteTextPlan(root: string, relativePath: unknown, text: unknown, tool: unknown): Promise<MutationPlanDraft> {
  if (typeof text !== 'string' || text.length > 32 * 1024 * 1024) throw new Error('Nothing to write.');
  const absolute = typeof relativePath === 'string' ? resolveInRoot(root, relativePath) : null;
  if (!absolute || absolute === normalizeRoot(root)) throw new Error('Choose a file name inside the folder.');
  const staged = join(stagingRoot(), randomUUID());
  await fs.mkdir(stagingRoot(), { recursive: true });
  await fs.writeFile(staged, text, 'utf8');
  const existing = await statOf(absolute);
  const newSize = Buffer.byteLength(text, 'utf8');
  const op: MutationOp = existing
    ? { kind: 'write', path: absolute, staged, expect: existing, newSize, detail: 'overwrite with the generated text' }
    : { kind: 'create', path: absolute, staged, newSize, detail: 'new file' };
  return { title: `Write ${basename(absolute)}`, tool: typeof tool === 'string' ? tool : '', root: normalizeRoot(root), ops: [op], skipped: [] };
}

// ---- IPC ----

function wrap<T>(action: () => Promise<T>): Promise<FsResult<{ value: T }>> {
  return action().then((value) => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : String(error) }));
}

export function registerMutationHandlers(): void {
  setPlanInterceptor((owner, draft) => registerPlan(owner, draft));
  void clearStaleStaging().then(() => pruneBackups()).catch(() => {});
  ipcMain.handle('dude:fsmut:planTrash', (event, root: unknown, paths: unknown, tool: unknown, title: unknown) => wrap(async () => {
    if (!isRootGranted(root)) throw new Error('Pick this folder with the native picker first.');
    return registerPlan(event.sender, await buildTrashPlan(root, paths, tool, title));
  }));
  ipcMain.handle('dude:fsmut:planWriteText', (event, root: unknown, relativePath: unknown, text: unknown, tool: unknown) => wrap(async () => {
    if (!isRootGranted(root)) throw new Error('Pick this folder with the native picker first.');
    return registerPlan(event.sender, await buildWriteTextPlan(root, relativePath, text, tool));
  }));
  ipcMain.handle('dude:fsmut:planUndo', (event, planId: unknown) => wrap(() => planUndo(event.sender, String(planId))));
  ipcMain.handle('dude:fsmut:issueToken', (event, planId: unknown) => issueToken(event.sender.id, String(planId)));
  ipcMain.handle('dude:fsmut:apply', (event, planId: unknown, token: unknown, options: unknown) =>
    wrap(() => applyPlan(event.sender, String(planId), token, { acceptNoUndo: !!(options && typeof options === 'object' && (options as { acceptNoUndo?: unknown }).acceptNoUndo === true) })));
  ipcMain.handle('dude:fsmut:cancelApply', (_event, planId: unknown) => cancelApply(String(planId)));
  ipcMain.handle('dude:fsmut:discard', (event, planId: unknown) => discardPlan(event.sender.id, String(planId)));
  ipcMain.handle('dude:fsmut:journal', () => wrap(() => listJournal()));
  ipcMain.handle('dude:fsmut:getSettings', () => wrap(async () => { await loadSettings(); return { settings, backupBytes: await backupUsage() }; }));
  ipcMain.handle('dude:fsmut:setSettings', (_event, patch: unknown) => wrap(() => setSettings(patch)));
  ipcMain.handle('dude:fsmut:purgeBackups', (_event, planId: unknown) => wrap(() => purgeBackups(typeof planId === 'string' ? planId : undefined)));
}
