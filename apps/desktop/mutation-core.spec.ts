import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ConfirmationStore, JsonJournal, digestOf } from './mutation-core';

interface Plan { id: string; ownerId: number; digest: string; expires: number }
function plan(id = 'p1', ownerId = 1, value: unknown = { a: 1 }, ttl = 60_000): Plan {
  return { id, ownerId, digest: digestOf(value), expires: Date.now() + ttl };
}

describe('digestOf', () => {
  it('is stable and content sensitive', () => {
    expect(digestOf({ a: 1 })).toBe(digestOf({ a: 1 }));
    expect(digestOf({ a: 1 })).not.toBe(digestOf({ a: 2 }));
    expect(digestOf('x')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('ConfirmationStore', () => {
  afterEach(() => vi.useRealTimers());
  const make = (extra: Partial<ConstructorParameters<typeof ConfirmationStore<Plan>>[0]> = {}) =>
    new ConfirmationStore<Plan>({ tokenTtlMs: 60_000, maxPlans: 2, maxTokens: 2, ...extra });

  it('issues single-use tokens', () => {
    const store = make();
    store.addPlan(plan());
    const issued = store.issueToken(1, 'p1');
    if (!issued.ok) throw new Error('expected token');
    expect(store.consume(1, 'p1', issued.token).id).toBe('p1');
    expect(() => store.consume(1, 'p1', issued.token)).toThrow(/expired or the plan changed/);
  });

  it('rejects non-string tokens, wrong owner and unknown plans', () => {
    const store = make();
    store.addPlan(plan());
    expect(() => store.consume(1, 'p1', undefined)).toThrow(/Confirm this change/);
    expect(store.issueToken(2, 'p1')).toEqual({ ok: false, error: 'This preview expired. Build it again.' });
    const issued = store.issueToken(1, 'p1');
    if (!issued.ok) throw new Error('expected token');
    expect(() => store.consume(2, 'p1', issued.token)).toThrow(/expired or the plan changed/);
    // the failed attempt burned the token
    expect(() => store.consume(1, 'p1', issued.token)).toThrow();
  });

  it('rejects expired tokens', () => {
    vi.useFakeTimers();
    const store = make();
    store.addPlan(plan('p1', 1, {}, 10 * 60_000));
    const issued = store.issueToken(1, 'p1');
    if (!issued.ok) throw new Error('expected token');
    vi.advanceTimersByTime(61_000);
    expect(() => store.consume(1, 'p1', issued.token)).toThrow(/expired or the plan changed/);
  });

  it('rejects a token when the plan digest changed', () => {
    const store = make();
    store.addPlan(plan('p1', 1, { a: 1 }));
    const issued = store.issueToken(1, 'p1');
    if (!issued.ok) throw new Error('expected token');
    store.deletePlan('p1');
    store.addPlan(plan('p1', 1, { a: 2 }));
    expect(() => store.consume(1, 'p1', issued.token)).toThrow(/expired or the plan changed/);
  });

  it('caps pending plans and tokens', () => {
    const store = make();
    store.addPlan(plan('a'));
    store.addPlan(plan('b'));
    expect(() => store.addPlan(plan('c'))).toThrow(/Too many pending previews/);
    expect(store.planCount).toBe(2);
    expect(store.issueToken(1, 'a').ok).toBe(true);
    expect(store.issueToken(1, 'a').ok).toBe(true);
    expect(store.issueToken(1, 'a')).toEqual({ ok: false, error: 'Too many pending confirmations.' });
  });

  it('sweeps expired plans except busy ones and reports them', () => {
    const expired: string[] = [];
    const store = make({ isBusy: (id) => id === 'busy', onExpire: (p) => expired.push(p.id) });
    const now = Date.now();
    store.addPlan({ ...plan('gone'), expires: now - 1 });
    store.addPlan({ ...plan('busy'), expires: now - 1 });
    store.sweep(now);
    expect(store.getPlan('gone')).toBeUndefined();
    expect(store.getPlan('busy')).toBeDefined();
    expect(expired).toEqual(['gone']);
  });
});

describe('JsonJournal', () => {
  interface Entry { planId: string; appliedAt: string; note?: string }
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'dude-journal-')); });
  const entry = (n: number): Entry => ({ planId: randomUUID(), appliedAt: new Date(2026, 0, n).toISOString() });

  it('round trips and lists newest first', async () => {
    const journal = new JsonJournal<Entry>(() => dir, 10);
    const [a, b, c] = [entry(1), entry(3), entry(2)];
    for (const e of [a, b, c]) await journal.write(e);
    expect(await journal.read(a.planId)).toEqual(a);
    expect((await journal.list()).map((e) => e.planId)).toEqual([b.planId, c.planId, a.planId]);
    expect(readdirSync(dir).some((f) => f.endsWith('.tmp'))).toBe(false);
  });

  it('rejects bad ids', async () => {
    const journal = new JsonJournal<Entry>(() => dir, 10);
    writeFileSync(join(dir, 'evil.json'), '{}');
    expect(await journal.read('../evil')).toBeNull();
    expect(await journal.read('evil')).toBeNull();
    await expect(journal.write({ planId: '../x', appliedAt: '' })).rejects.toThrow();
  });

  it('updates in place, removes and trims oldest', async () => {
    const journal = new JsonJournal<Entry>(() => dir, 2);
    const entries = [entry(1), entry(2), entry(3), entry(4)];
    for (const e of entries) await journal.write(e);
    await journal.write({ ...entries[3], note: 'x' });
    const removed: string[] = [];
    await journal.trimTo(undefined, (e) => { removed.push(e.planId); });
    expect(removed.sort()).toEqual([entries[0].planId, entries[1].planId].sort());
    expect((await journal.list()).length).toBe(2);
    await journal.remove(entries[3].planId);
    expect(await journal.read(entries[3].planId)).toBeNull();
  });
});
