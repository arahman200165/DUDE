import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

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

export class JsonJournal<E extends { readonly planId: string; readonly appliedAt: string }> {
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
