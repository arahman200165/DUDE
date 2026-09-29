import { app, ipcMain, type WebContents } from 'electron';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_SYS_MUTATION_SETTINGS,
  type SysApplyResult, type SysJournalEntry, type SysJournalOp, type SysMutationSettings, type SysMutResult,
  type SysOpOutcome, type SysOpRequest, type SysPlanPreview, type SysPreviewOp,
} from '../src/shared-logic/system/sys-mutation-types';
import type { SysResult } from '../src/shared-logic/system/system-types';
import { ConfirmationStore, JsonJournal, digestOf } from './mutation-core';
import { sysHelper } from './sys-helper';
import { registerBuiltinSysOps } from './sys-ops';

/**
 * DUDE's Windows system mutation engine (DUDE_PRD.md §5.2.1, Phase 31 Milestone 594): the generic
 * plan → typed confirm → single-use token → apply → journal → undo pipeline. Op families (process kill,
 * registry set, ...) plug in through `registerSysOp`; the engine knows nothing about any of them.
 * Renderer requests carry only `kind` + params; main validates, reads live state (the precondition,
 * kept main-side), and every op re-checks that precondition when applied.
 */

const PLAN_TTL_MS = 15 * 60_000;
const MAX_OPS = 1000;
const MAX_JOURNAL = 500;
const KIND_PATTERN = /^[a-z][a-z0-9-]*\.[a-zA-Z][a-zA-Z0-9-]*$/;

// ---- Op registry ----

export interface SysOpContext {
  readonly elevated: boolean;
  /** Internal helper access; mutation helper methods are allowed here, unlike the renderer path. */
  helper(method: string, params: object): Promise<SysResult<unknown>>;
}

export interface SysApplyContext extends SysOpContext {
  readonly signal: AbortSignal;
  /** Saves original content under `userData/sys-backups/<planId>/<index>-<name>`. */
  backup(name: string, content: string | Buffer): Promise<void>;
}

export interface SysOpPreviewResult {
  target: string;
  summary: string;
  before?: string;
  after?: string;
  warnings?: string[];
  requiresElevation: boolean;
  typedConfirm?: string;
  noUndo: boolean;
  /** Live state captured now; handed back to `apply`, which must re-check it. */
  precondition: unknown;
  blockedReason?: string;
}

export interface SysOpApplyResult {
  outcome: 'applied' | 'conflict' | 'failed';
  message?: string;
  before?: string;
  after?: string;
  undo?: SysOpRequest;
}

export interface SysOpDefinition<P = unknown> {
  readonly kind: string;
  validate(raw: unknown): P;
  preview(params: P, ctx: SysOpContext): Promise<SysOpPreviewResult>;
  /** Must re-check `precondition` against live state first and return `conflict` on mismatch. */
  apply(params: P, precondition: unknown, ctx: SysApplyContext): Promise<SysOpApplyResult>;
}

const ops = new Map<string, SysOpDefinition<any>>();

export function registerSysOp<P>(def: SysOpDefinition<P>): void {
  if (!KIND_PATTERN.test(def.kind)) throw new Error(`Invalid system op kind: ${def.kind}`);
  if (ops.has(def.kind)) throw new Error(`System op already registered: ${def.kind}`);
  ops.set(def.kind, def);
}
// Built-in families register here (not as an import side effect) because the families import types from this module.
registerBuiltinSysOps(registerSysOp);
export function sysOpKinds(): string[] { return [...ops.keys()]; }
export function resetSysOpsForTesting(): void { ops.clear(); }

// ---- Paths / state ----

let rootOverride: string | null = null;
export function setSysMutationRootForTesting(dir: string | null): void {
  rootOverride = dir;
  settings = DEFAULT_SYS_MUTATION_SETTINGS;
  settingsLoaded = false;
}
function userData(): string { return rootOverride ?? app.getPath('userData'); }
function backupsRoot(): string { return join(userData(), 'sys-backups'); }
function settingsPath(): string { return join(userData(), 'sys-mutation-settings.json'); }

const journal = new JsonJournal<SysJournalEntry>(() => join(userData(), 'sys-journal'), MAX_JOURNAL);
const applying = new Map<string, AbortController>();
const applyingOwners = new Set<number>();

interface PlanOp {
  readonly def: SysOpDefinition<any>;
  readonly params: unknown;
  readonly precondition: unknown;
  readonly preview: SysOpPreviewResult;
  readonly request: SysOpRequest;
}
interface StoredSysPlan {
  readonly id: string;
  readonly ownerId: number;
  readonly digest: string;
  readonly expires: number;
  readonly preview: SysPlanPreview;
  readonly ops: readonly PlanOp[];
  readonly undoOf?: string;
}

const store = new ConfirmationStore<StoredSysPlan>({
  tokenTtlMs: 60_000, maxPlans: 32, maxTokens: 32,
  isBusy: (id) => applying.has(id),
});

// ---- Planning ----

async function isElevated(): Promise<boolean> {
  try {
    const result = await sysHelper().call('helper.info', {});
    return result.ok && (result.data as { elevated?: boolean } | null)?.elevated === true;
  } catch { return false; }
}

const helperCall = (method: string, params: object) => sysHelper().call(method, params);

function isPlain(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export async function planSystemChange(owner: { id: number }, request: unknown, options: { undoOf?: string } = {}): Promise<SysPlanPreview> {
  store.sweep();
  if (!isPlain(request)) throw new Error('Invalid change request.');
  const { tool, title, ops: rawOps } = request;
  if (typeof tool !== 'string' || tool.length > 100) throw new Error('Invalid change request: tool.');
  if (typeof title !== 'string' || !title || title.length > 200) throw new Error('Invalid change request: title.');
  if (!Array.isArray(rawOps) || !rawOps.length) throw new Error('Nothing to change.');
  if (rawOps.length > MAX_OPS) throw new Error(`Too many changes in one plan (max ${MAX_OPS}).`);
  const elevated = await isElevated();
  const ctx: SysOpContext = { elevated, helper: helperCall };
  const planOps: PlanOp[] = [];
  for (const raw of rawOps) {
    if (!isPlain(raw) || typeof raw.kind !== 'string') throw new Error('Invalid change request: op.');
    const def = ops.get(raw.kind);
    if (!def) throw new Error(`Unknown system change: ${raw.kind}`);
    const params = def.validate(raw.params);
    const preview = await def.preview(params, ctx);
    planOps.push({ def, params, precondition: preview.precondition, preview, request: { kind: def.kind, params } });
  }
  const blocked: { index: number; reason: string }[] = [];
  const previewOps: SysPreviewOp[] = planOps.map(({ def, preview }, index) => {
    if (preview.blockedReason) blocked.push({ index, reason: preview.blockedReason });
    else if (preview.requiresElevation && !elevated) blocked.push({ index, reason: 'Needs an elevated session. Relaunch DUDE as Administrator.' });
    return {
      index, kind: def.kind, target: preview.target, summary: preview.summary,
      ...(preview.before !== undefined ? { before: preview.before } : {}),
      ...(preview.after !== undefined ? { after: preview.after } : {}),
      warnings: preview.warnings ?? [], requiresElevation: preview.requiresElevation,
      ...(preview.typedConfirm ? { typedConfirm: preview.typedConfirm } : {}),
      noUndo: preview.noUndo,
    };
  });
  const id = randomUUID();
  const expires = Date.now() + PLAN_TTL_MS;
  const typedConfirm = [...new Set(previewOps.flatMap((op) => (op.typedConfirm ? [op.typedConfirm] : [])))];
  const preview: SysPlanPreview = {
    planId: id, title, tool, ops: previewOps, blocked, typedConfirm,
    noUndo: previewOps.some((op) => op.noUndo), elevated,
    expiresAt: new Date(expires).toISOString(),
    ...(options.undoOf ? { undoOf: options.undoOf } : {}),
  };
  const digest = digestOf(planOps.map((op) => [op.def.kind, op.params, op.precondition]));
  store.addPlan({ id, ownerId: owner.id, digest, expires, preview, ops: planOps, undoOf: options.undoOf });
  return preview;
}

// ---- Confirmation ----

export function issueSystemToken(ownerId: number, planId: string, typed: unknown): { ok: true; token: string; expiresAt: string } | { ok: false; error: string } {
  store.sweep();
  const plan = store.getPlan(planId);
  if (plan && plan.ownerId === ownerId) {
    if (plan.preview.blocked.length) return { ok: false, error: 'This plan has changes that cannot be applied in this session.' };
    const given = Array.isArray(typed) && typed.every((item) => typeof item === 'string')
      ? new Set((typed as string[]).map((item) => item.trim().toLowerCase()))
      : null;
    if (plan.preview.typedConfirm.length && (!given || !plan.preview.typedConfirm.every((name) => given.has(name.trim().toLowerCase())))) {
      return { ok: false, error: 'Type the exact name of each critical target to confirm.' };
    }
  }
  return store.issueToken(ownerId, planId);
}

export function discardSystemPlan(ownerId: number, planId: string): boolean {
  const plan = store.getPlan(planId);
  if (!plan || plan.ownerId !== ownerId) return false;
  return store.deletePlan(planId);
}

export function cancelSystemApply(planId: string): boolean {
  const abort = applying.get(planId);
  abort?.abort();
  return !!abort;
}

// ---- Apply ----

function safeName(name: string): string { return name.replace(/[^\w.-]/g, '_').slice(0, 100) || 'backup'; }

export async function applySystemPlan(
  owner: Pick<WebContents, 'id' | 'send' | 'isDestroyed'>, planId: string, token: unknown, options: { acceptNoUndo?: boolean } = {},
): Promise<SysApplyResult> {
  store.sweep();
  if (applyingOwners.has(owner.id)) throw new Error('Another change is already being applied.');
  const plan = store.consume(owner.id, planId, token);
  if (plan.preview.blocked.length) throw new Error('This plan has changes that cannot be applied in this session.');
  if (plan.preview.noUndo && !options.acceptNoUndo) throw new Error('This plan includes changes that cannot be undone. Acknowledge that to apply it.');
  store.deletePlan(planId);
  await loadSettings();
  const abort = new AbortController();
  applying.set(planId, abort);
  applyingOwners.add(owner.id);
  const results: SysJournalOp[] = [];
  let backupBytes = 0;
  try {
    for (let index = 0; index < plan.ops.length; index++) {
      const { def, params, precondition, preview } = plan.ops[index];
      const base = { kind: def.kind, target: preview.target, summary: preview.summary, noUndo: preview.noUndo };
      if (abort.signal.aborted) {
        results.push({ ...base, outcome: 'cancelled' });
      } else {
        const ctx: SysApplyContext = {
          elevated: plan.preview.elevated, helper: helperCall, signal: abort.signal,
          backup: async (name, content) => {
            const dir = join(backupsRoot(), planId);
            await fs.mkdir(dir, { recursive: true });
            await fs.writeFile(join(dir, `${index}-${safeName(name)}`), content);
            backupBytes += typeof content === 'string' ? Buffer.byteLength(content) : content.length;
          },
        };
        try {
          const result = await def.apply(params, precondition, ctx);
          const outcome: SysOpOutcome = result.outcome === 'applied' || result.outcome === 'conflict' ? result.outcome : 'failed';
          results.push({
            ...base, outcome,
            ...(result.message !== undefined ? { message: result.message } : {}),
            ...(result.before !== undefined ? { before: result.before } : {}),
            ...(result.after !== undefined ? { after: result.after } : {}),
            ...(outcome === 'applied' && result.undo ? { undo: result.undo } : {}),
          });
        } catch (error) {
          results.push({ ...base, outcome: 'failed', message: error instanceof Error ? error.message : String(error) });
        }
      }
      if (!owner.isDestroyed()) owner.send('dude:sysmut:progress', { planId, done: index + 1, total: plan.ops.length });
    }
  } finally {
    applying.delete(planId);
    applyingOwners.delete(owner.id);
  }
  const entry: SysJournalEntry = {
    planId, title: plan.preview.title, tool: plan.preview.tool, appliedAt: new Date().toISOString(),
    elevated: plan.preview.elevated, ops: results, backupBytes, backupsPruned: false,
    ...(plan.undoOf ? { undoOf: plan.undoOf } : {}),
  };
  await journal.write(entry);
  if (plan.undoOf) {
    const original = await journal.read(plan.undoOf);
    if (original) await journal.write({ ...original, undoneBy: planId });
  }
  await pruneSystemBackups();
  const count = (outcome: SysOpOutcome) => results.filter((result) => result.outcome === outcome).length;
  return { planId, applied: count('applied'), conflicts: count('conflict'), failed: count('failed'), cancelled: count('cancelled'), journal: entry };
}

// ---- Journal + undo ----

export function listSystemJournal(): Promise<SysJournalEntry[]> { return journal.list(); }

export async function planSystemUndo(owner: { id: number }, planId: string): Promise<SysPlanPreview> {
  const entry = await journal.read(planId);
  if (!entry) throw new Error('That change is no longer in the journal.');
  if (entry.undoneBy) throw new Error('This change was already undone.');
  const undoOps = [...entry.ops].reverse().flatMap((op) => (op.outcome === 'applied' && op.undo ? [op.undo] : []));
  if (!undoOps.length) throw new Error('Nothing in this change can be undone.');
  return planSystemChange(owner, { tool: entry.tool, title: `Undo: ${entry.title}`.slice(0, 200), ops: undoOps }, { undoOf: entry.planId });
}

// ---- Settings + retention ----

let settings: SysMutationSettings = DEFAULT_SYS_MUTATION_SETTINGS;
let settingsLoaded = false;

async function loadSettings(): Promise<void> {
  if (settingsLoaded) return;
  try { settings = sanitizeSysSettings(JSON.parse(await fs.readFile(settingsPath(), 'utf8'))); } catch { settings = DEFAULT_SYS_MUTATION_SETTINGS; }
  settingsLoaded = true;
}

export function sanitizeSysSettings(raw: unknown): SysMutationSettings {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<SysMutationSettings>;
  const days = Number(value.retentionDays);
  const bytes = Number(value.maxBackupBytes);
  return {
    retentionDays: Number.isFinite(days) ? Math.min(3650, Math.max(1, Math.round(days))) : DEFAULT_SYS_MUTATION_SETTINGS.retentionDays,
    maxBackupBytes: Number.isFinite(bytes) ? Math.min(2 ** 50, Math.max(0, Math.round(bytes))) : DEFAULT_SYS_MUTATION_SETTINGS.maxBackupBytes,
  };
}

export async function setSysSettings(patch: unknown): Promise<SysMutationSettings> {
  await loadSettings();
  settings = sanitizeSysSettings({ ...settings, ...(patch && typeof patch === 'object' ? patch : {}) });
  await fs.mkdir(userData(), { recursive: true });
  await fs.writeFile(settingsPath(), JSON.stringify(settings), 'utf8');
  await pruneSystemBackups();
  return settings;
}

export async function systemBackupUsage(): Promise<number> {
  let total = 0;
  for (const dir of await fs.readdir(backupsRoot()).catch(() => [] as string[])) {
    for (const file of await fs.readdir(join(backupsRoot(), dir)).catch(() => [] as string[])) {
      total += (await fs.stat(join(backupsRoot(), dir, file)).catch(() => ({ size: 0 }))).size;
    }
  }
  return total;
}

async function dropBackups(entry: SysJournalEntry): Promise<void> {
  await fs.rm(join(backupsRoot(), entry.planId), { recursive: true, force: true });
  await journal.write({ ...entry, backupsPruned: true });
}

/** Oldest first: past the retention window, then until total backups fit the cap. Journal is capped at 500. */
export async function pruneSystemBackups(now = Date.now()): Promise<void> {
  await loadSettings();
  const entries = (await journal.list()).filter((entry) => entry.backupBytes > 0 && !entry.backupsPruned).reverse();
  let total = entries.reduce((sum, entry) => sum + entry.backupBytes, 0);
  for (const entry of entries) {
    const old = now - Date.parse(entry.appliedAt) > settings.retentionDays * 86_400_000;
    if (old || total > settings.maxBackupBytes) { total -= entry.backupBytes; await dropBackups(entry); }
  }
  await journal.trimTo(MAX_JOURNAL, (entry) => fs.rm(join(backupsRoot(), entry.planId), { recursive: true, force: true }));
}

export async function purgeSystemBackups(planId?: string): Promise<void> {
  for (const entry of await journal.list()) {
    if ((!planId || entry.planId === planId) && entry.backupBytes > 0 && !entry.backupsPruned) await dropBackups(entry);
  }
}

// ---- IPC ----

function wrap<T>(action: () => Promise<T> | T): Promise<SysMutResult<T>> {
  return Promise.resolve().then(action).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : String(error) }),
  );
}

export function registerSysMutationHandlers(): void {
  void pruneSystemBackups().catch(() => {});
  ipcMain.handle('dude:sysmut:plan', (event, request: unknown) => wrap(() => planSystemChange(event.sender, request)));
  ipcMain.handle('dude:sysmut:planUndo', (event, planId: unknown) => wrap(() => planSystemUndo(event.sender, String(planId))));
  ipcMain.handle('dude:sysmut:issueToken', (event, planId: unknown, typed: unknown) =>
    wrap(() => {
      const issued = issueSystemToken(event.sender.id, String(planId), typed);
      if (!issued.ok) throw new Error(issued.error);
      return { token: issued.token, expiresAt: issued.expiresAt };
    }));
  ipcMain.handle('dude:sysmut:apply', (event, planId: unknown, token: unknown, options: unknown) =>
    wrap(() => applySystemPlan(event.sender, String(planId), token, { acceptNoUndo: isPlain(options) && options['acceptNoUndo'] === true })));
  ipcMain.handle('dude:sysmut:cancelApply', (_event, planId: unknown) => cancelSystemApply(String(planId)));
  ipcMain.handle('dude:sysmut:discard', (event, planId: unknown) => discardSystemPlan(event.sender.id, String(planId)));
  ipcMain.handle('dude:sysmut:journal', () => wrap(() => listSystemJournal()));
  ipcMain.handle('dude:sysmut:getSettings', () => wrap(async () => { await loadSettings(); return { settings, backupBytes: await systemBackupUsage() }; }));
  ipcMain.handle('dude:sysmut:setSettings', (_event, patch: unknown) => wrap(() => setSysSettings(patch)));
  ipcMain.handle('dude:sysmut:purgeBackups', (_event, planId: unknown) => wrap(() => purgeSystemBackups(typeof planId === 'string' ? planId : undefined)));
}
