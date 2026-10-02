import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { isDeviceStoreReady, storeCall } from './device-store/store-client';
import { StoreJournal } from './device-store/store-journal';

/**
 * Electron-free building blocks of the Destructive-Action Contract (DUDE_PRD.md §5.2.1): a pending-plan
 * store with digest-bound, single-use, owner-bound confirmation tokens, and an atomic JSON journal.
 * Extracted from the Phase 29 filesystem engine (`fs-mutation.ts`), which now builds on it, for reuse
 * by the Phase 31 system engine (`sys-mutation.ts`).
 */

export function digestOf(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export interface StoredPlanBase {
  readonly id: string;
  readonly ownerId: number;
  readonly digest: string;
  readonly expires: number;
}

export interface ConfirmationStoreOptions<P> {
  readonly tokenTtlMs: number;
  readonly maxPlans: number;
  readonly maxTokens: number;
  /** A busy plan (currently applying) is never swept even when expired. */
  isBusy?(id: string): boolean;
  onExpire?(plan: P): void;
}

interface StagedToken { readonly planId: string; readonly ownerId: number; readonly digest: string; readonly expires: number }

export class ConfirmationStore<P extends StoredPlanBase> {
  private readonly plans = new Map<string, P>();
  private readonly tokens = new Map<string, StagedToken>();

  constructor(private readonly options: ConfirmationStoreOptions<P>) {}

  get planCount(): number { return this.plans.size; }

  sweep(now = Date.now()): void {
    for (const [token, value] of this.tokens) if (value.expires < now) this.tokens.delete(token);
    for (const [id, plan] of this.plans) {
      if (plan.expires < now && !this.options.isBusy?.(id)) {
        this.plans.delete(id);
        this.options.onExpire?.(plan);
      }
    }
  }

  addPlan(plan: P): void {
    this.sweep();
    if (this.plans.size >= this.options.maxPlans) throw new Error('Too many pending previews. Apply or discard one first.');
    this.plans.set(plan.id, plan);
  }

  getPlan(id: string): P | undefined { return this.plans.get(id); }

  deletePlan(id: string): boolean { return this.plans.delete(id); }

  issueToken(ownerId: number, planId: string): { ok: true; token: string; expiresAt: string } | { ok: false; error: string } {
    this.sweep();
    const plan = this.plans.get(planId);
    if (!plan || plan.ownerId !== ownerId) return { ok: false, error: 'This preview expired. Build it again.' };
    if (this.tokens.size >= this.options.maxTokens) return { ok: false, error: 'Too many pending confirmations.' };
    const token = randomUUID();
    const expires = Date.now() + this.options.tokenTtlMs;
    this.tokens.set(token, { planId, ownerId, digest: plan.digest, expires });
    return { ok: true, token, expiresAt: new Date(expires).toISOString() };
  }

  /** Single-use: the token is deleted on any attempt, successful or not. */
  consume(ownerId: number, planId: string, token: unknown): P {
    if (typeof token !== 'string') throw new Error('Confirm this change before applying it.');
    const staged = this.tokens.get(token);
    this.tokens.delete(token);
    const plan = this.plans.get(planId);
    if (!staged || !plan || staged.planId !== planId || staged.ownerId !== ownerId || staged.expires < Date.now() || staged.digest !== plan.digest) {
      throw new Error('Confirmation expired or the plan changed. Review it again.');
    }
    return plan;
  }
}

const JOURNAL_ID = /^[0-9a-f-]{36}$/;

export interface JournalEntryBase { readonly planId: string; readonly appliedAt: string }

/** The journal surface the fs and sys engines use; implemented over JSON files and over the Device State Store. */
export interface MutationJournal<E extends JournalEntryBase> {
  write(entry: E): Promise<void>;
  read(planId: string): Promise<E | null>;
  /** Newest first. */
  list(): Promise<E[]>;
  remove(planId: string): Promise<void>;
  /** Drops the oldest entries beyond `maxEntries` (default: the configured cap), passing each to `onRemove` first. */
  trimTo(maxEntries?: number, onRemove?: (entry: E) => Promise<void> | void): Promise<void>;
}

export class JsonJournal<E extends JournalEntryBase> implements MutationJournal<E> {
  constructor(private readonly dir: () => string, private readonly maxEntries: number) {}

  async write(entry: E): Promise<void> {
    if (!JOURNAL_ID.test(entry.planId)) throw new Error('Invalid journal id.');
    await fs.mkdir(this.dir(), { recursive: true });
    const target = join(this.dir(), `${entry.planId}.json`);
    await fs.writeFile(`${target}.tmp`, JSON.stringify(entry), 'utf8');
    await fs.rename(`${target}.tmp`, target);
  }

  async read(planId: string): Promise<E | null> {
    if (typeof planId !== 'string' || !JOURNAL_ID.test(planId)) return null;
    try { return JSON.parse(await fs.readFile(join(this.dir(), `${planId}.json`), 'utf8')) as E; } catch { return null; }
  }

  /** Newest first. */
  async list(): Promise<E[]> {
    const files = (await fs.readdir(this.dir()).catch(() => [] as string[])).filter((file) => file.endsWith('.json'));
    const read = await Promise.all(files.map((file) => this.read(file.slice(0, -5))));
    const entries: E[] = [];
    for (const entry of read) if (entry) entries.push(entry);
    return entries.sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));
  }

  async remove(planId: string): Promise<void> {
    if (!JOURNAL_ID.test(planId)) return;
    await fs.rm(join(this.dir(), `${planId}.json`), { force: true });
  }

  /** Drops the oldest entries beyond `maxEntries` (default: the constructor cap). */
  async trimTo(maxEntries = this.maxEntries, onRemove?: (entry: E) => Promise<void> | void): Promise<void> {
    const all = await this.list();
    for (const entry of all.slice(maxEntries)) {
      await onRemove?.(entry);
      await this.remove(entry.planId);
    }
  }
}

/**
 * The journal an engine uses: the Device State Store when it is ready, else the legacy JSON directory
 * (degraded mode). Entries written while degraded are moved into the store by `drainLegacyJournal`.
 */
export function createMutationJournal<E extends JournalEntryBase>(engine: 'fs' | 'sys', legacyDir: string | (() => string), max: number): MutationJournal<E> {
  const json = new JsonJournal<E>(typeof legacyDir === 'function' ? legacyDir : () => legacyDir, max);
  const store = new StoreJournal<E>(engine, max);
  const pick = (): MutationJournal<E> => (isDeviceStoreReady() ? store : json);
  return {
    write: (entry) => pick().write(entry),
    read: (planId) => pick().read(planId),
    list: () => pick().list(),
    remove: (planId) => pick().remove(planId),
    trimTo: (maxEntries, onRemove) => pick().trimTo(maxEntries, onRemove),
  };
}

/**
 * Moves every JSON journal entry in `legacyDir` into the store (an upsert, so it is idempotent) and then
 * deletes the drained files, leaving the directory. Imports pre-31B journals once and recovers entries
 * written while degraded. Returns how many entries were moved. A file that fails to parse is left alone.
 */
export async function drainLegacyJournal(engine: 'fs' | 'sys', legacyDir: string): Promise<number> {
  if (!isDeviceStoreReady()) return 0;
  const files = (await fs.readdir(legacyDir).catch(() => [] as string[])).filter((file) => file.endsWith('.json') && JOURNAL_ID.test(file.slice(0, -5)));
  let moved = 0;
  for (const file of files) {
    const path = join(legacyDir, file);
    let entry: JournalEntryBase;
    try { entry = JSON.parse(await fs.readFile(path, 'utf8')) as JournalEntryBase; } catch { continue; }
    if (!entry || entry.planId !== file.slice(0, -5) || typeof entry.appliedAt !== 'string') continue;
    const existing = await storeCall('journal.get', { engine, planId: entry.planId });
    if (!existing || JSON.stringify(existing) !== JSON.stringify(entry)) await storeCall('journal.append', { engine, entry: entry as never });
    await fs.rm(path, { force: true });
    moved++;
  }
  return moved;
}
