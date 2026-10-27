import { existsSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfirmationStore, CONFIRMATION_TTL_MS } from '../security/confirmation-store.js';
import { openBlobFixture } from './blob-fixture.js';
import {
  BLOB_GC_ACTION, BLOB_GC_CONSEQUENCE_CLASS, BlobGcError, DEFAULT_BLOB_GC_GRACE_MS, MIN_BLOB_GC_GRACE_MS, applyBlobGc, blobGcDigest, planBlobGc, previewBlobGc,
} from './blob-gc.js';
import { activeBlobLeases, tryAcquireBlobLease } from './lease.js';
import { addBlobRef, getBlobRow, removeBlobRef } from './registry.js';

/** The Destructive-Action Contract's confirmation-boundary spec for blob garbage collection (PD-148). */
const fixtures: Array<ReturnType<typeof openBlobFixture>> = [];
const GRACE = MIN_BLOB_GC_GRACE_MS;
const HOUR = 3600_000;

function setup() {
  const f = openBlobFixture();
  fixtures.push(f);
  const confirmations = new ConfirmationStore();
  let drains = 0;
  const deps = { db: f.db, store: f.store, confirmations, now: f.now, afterCommit: () => { drains += 1; } };
  const file = (sha: string) => path.join(f.paths.blobsDir, sha.slice(0, 2), sha.slice(2, 4), sha);
  const snapshot = () => JSON.stringify(['blobs', 'blob_refs', 'meta', 'audit_outbox'].map((t) => f.db.prepare(`SELECT * FROM ${t} ORDER BY 1, 2`).all()));
  const refuse = async (run: () => Promise<unknown>): Promise<BlobGcError> => {
    try { await run(); } catch (error) { return error as BlobGcError; }
    throw new Error('expected a refusal');
  };
  return { f, deps, confirmations, file, snapshot, drains: () => drains, refuse };
}
afterEach(() => { for (const f of fixtures.splice(0)) f.close(); });

describe('blob garbage collection confirmation boundary', () => {
  it('is tagged filesystem-write and database-write', () => {
    expect(BLOB_GC_CONSEQUENCE_CLASS).toEqual(['filesystem-write', 'database-write']);
    const s = setup();
    expect(previewBlobGc(s.deps, { graceMs: GRACE }).consequenceClass).toEqual(['filesystem-write', 'database-write']);
  });

  it('the preview writes nothing: no row, no meta, no outbox event, no file removed', async () => {
    const s = setup();
    const orphan = await s.f.add('orphan');
    await s.f.add('live', 'owner');
    s.f.advance(2 * GRACE);
    const before = s.snapshot();
    const preview = previewBlobGc(s.deps, { graceMs: GRACE });
    expect(preview.plan.blobs.map((b) => b.sha256)).toEqual([orphan]);
    expect(preview.plan.totalBytes).toBe(6);
    expect(preview.plan.digest).toBe(blobGcDigest(GRACE, preview.plan.blobs));
    expect(s.snapshot()).toBe(before);
    expect(existsSync(s.file(orphan))).toBe(true);
    expect(planBlobGc(s.f.db, { graceMs: GRACE, now: s.f.now() }).digest).toBe(preview.plan.digest);
    expect(s.snapshot()).toBe(before);
    expect(s.drains()).toBe(0);
  });

  it('deletes only after the confirm, then records one audit event through the outbox', async () => {
    const s = setup();
    const orphan = await s.f.add('orphan');
    s.f.advance(2 * GRACE);
    const preview = previewBlobGc(s.deps, { graceMs: GRACE });
    const result = await applyBlobGc(s.deps, { plan: preview.plan, confirmToken: preview.confirmToken });
    expect(result).toEqual({ deleted: 1, bytes: 6, skipped: [] });
    expect(existsSync(s.file(orphan))).toBe(false);
    expect(getBlobRow(s.f.db, orphan)).toBeUndefined();
    expect(s.f.db.prepare('SELECT event, outcome, actor_kind FROM audit_outbox').all()).toEqual([{ event: 'blobs.gc-applied', outcome: 'success', actor_kind: 'cli' }]);
    expect(s.drains()).toBe(1);
    expect(activeBlobLeases(s.f.db, s.f.now())).toEqual([]);
  });

  it('keeps only the hash of a token; it is single-use and expires after 60 seconds', async () => {
    const s = setup();
    await s.f.add('orphan');
    s.f.advance(2 * GRACE);
    const preview = previewBlobGc(s.deps, { graceMs: GRACE });
    const stored = [...(s.confirmations as unknown as { staged: Map<string, { action: string }> }).staged.entries()];
    expect(stored).toHaveLength(1);
    expect(stored[0]![0]).toMatch(/^[0-9a-f]{64}$/);
    expect(stored[0]![0]).not.toBe(preview.confirmToken);
    expect(stored[0]![1].action).toBe(BLOB_GC_ACTION);

    await applyBlobGc(s.deps, { plan: preview.plan, confirmToken: preview.confirmToken });
    expect((await s.refuse(() => applyBlobGc(s.deps, { plan: preview.plan, confirmToken: preview.confirmToken }))).code).toBe('confirmation-required');

    const second = previewBlobGc(s.deps, { graceMs: GRACE });
    s.f.advance(CONFIRMATION_TTL_MS + 1);
    expect((await s.refuse(() => applyBlobGc(s.deps, { plan: second.plan, confirmToken: second.confirmToken }))).code).toBe('confirmation-required');
    expect((await s.refuse(() => applyBlobGc(s.deps, { plan: second.plan, confirmToken: '' }))).code).toBe('confirmation-required');
    expect((await s.refuse(() => applyBlobGc(s.deps, { plan: second.plan, confirmToken: 'made-up' }))).code).toBe('confirmation-required');
  });

  it('refuses a token used with a different plan, and spends the token doing so', async () => {
    const s = setup();
    const first = await s.f.add('first');
    s.f.advance(2 * GRACE);
    const preview = previewBlobGc(s.deps, { graceMs: GRACE });
    const second = await s.f.add('second');
    // Make it a candidate too without outliving the token (the clock stays within its 60 seconds).
    s.f.db.prepare('UPDATE blobs SET unreferenced_since = ? WHERE sha256 = ?').run('2020-01-01T00:00:00.000Z', second);
    const bigger = planBlobGc(s.f.db, { graceMs: GRACE, now: s.f.now() });
    expect(bigger.blobs.map((b) => b.sha256).sort()).toEqual([first, second].sort());
    // A self-consistent plan that was never previewed.
    expect((await s.refuse(() => applyBlobGc(s.deps, { plan: bigger, confirmToken: preview.confirmToken }))).code).toBe('plan-mismatch');
    expect(existsSync(s.file(first))).toBe(true);
    expect(existsSync(s.file(second))).toBe(true);
    expect((await s.refuse(() => applyBlobGc(s.deps, { plan: preview.plan, confirmToken: preview.confirmToken }))).code).toBe('confirmation-required');
    // A plan edited after the preview does not match its own digest.
    const fresh = previewBlobGc(s.deps, { graceMs: GRACE });
    const tampered = { ...fresh.plan, blobs: fresh.plan.blobs.slice(1) };
    expect((await s.refuse(() => applyBlobGc(s.deps, { plan: tampered, confirmToken: fresh.confirmToken }))).code).toBe('invalid-plan');
    expect(existsSync(s.file(first))).toBe(true);
  });

  it('refuses a token that was issued for another action', async () => {
    const s = setup();
    await s.f.add('orphan');
    s.f.advance(2 * GRACE);
    const plan = planBlobGc(s.f.db, { graceMs: GRACE, now: s.f.now() });
    const token = s.confirmations.issue({ action: 'purge.something-else', digest: plan.digest, bindingId: 'cli', now: s.f.now() });
    expect((await s.refuse(() => applyBlobGc(s.deps, { plan, confirmToken: token }))).code).toBe('confirmation-required');
  });

  it('never deletes a referenced blob, even one that gained a reference after the preview', async () => {
    const s = setup();
    const raced = await s.f.add('raced');
    const live = await s.f.add('live', 'owner');
    s.f.advance(2 * GRACE);
    const preview = previewBlobGc(s.deps, { graceMs: GRACE });
    expect(preview.plan.blobs.map((b) => b.sha256)).toEqual([raced]);
    addBlobRef(s.f.db, { sha256: raced, ownerKind: 'attachment', ownerId: 'late', now: s.f.now() });
    const result = await applyBlobGc(s.deps, { plan: preview.plan, confirmToken: preview.confirmToken });
    expect(result).toEqual({ deleted: 0, bytes: 0, skipped: [{ sha256: raced, reason: 'referenced' }] });
    expect(existsSync(s.file(raced))).toBe(true);
    expect(existsSync(s.file(live))).toBe(true);
    expect(getBlobRow(s.f.db, raced)).toMatchObject({ state: 'ok' });
    // A hand-built plan naming a referenced blob is just as harmless.
    const forged = { ...planBlobGc(s.f.db, { graceMs: GRACE, now: s.f.now() }) };
    const forgedPlan = { ...forged, blobs: [{ sha256: live, size: 4, state: 'ok' as const, unreferencedSince: '2000-01-01T00:00:00.000Z' }], totalBytes: 4 };
    forgedPlan.digest = blobGcDigest(forgedPlan.graceMs, forgedPlan.blobs);
    const token = s.confirmations.issue({ action: BLOB_GC_ACTION, digest: forgedPlan.digest, bindingId: 'cli', now: s.f.now() });
    expect((await applyBlobGc(s.deps, { plan: forgedPlan, confirmToken: token })).skipped).toEqual([{ sha256: live, reason: 'referenced' }]);
    expect(existsSync(s.file(live))).toBe(true);
  });

  it('honours the grace period, counted from when the last reference went', async () => {
    const s = setup();
    const young = await s.f.add('young');
    s.f.advance(GRACE - 1);
    expect(planBlobGc(s.f.db, { graceMs: GRACE, now: s.f.now() }).blobs).toEqual([]);
    s.f.advance(1);
    expect(planBlobGc(s.f.db, { graceMs: GRACE, now: s.f.now() }).blobs.map((b) => b.sha256)).toEqual([young]);

    // Old blob, referenced a long time, last reference dropped just now: protected until the grace elapses again.
    const kept = await s.f.add('kept', 'owner');
    s.f.advance(10 * GRACE);
    removeBlobRef(s.f.db, { sha256: kept, ownerKind: 'attachment', ownerId: 'owner', now: s.f.now() });
    expect(planBlobGc(s.f.db, { graceMs: GRACE, now: s.f.now() }).blobs.map((b) => b.sha256)).not.toContain(kept);
    s.f.advance(GRACE);
    expect(planBlobGc(s.f.db, { graceMs: GRACE, now: s.f.now() }).blobs.map((b) => b.sha256)).toContain(kept);

    // A preview taken with a short plan cannot be applied after the grace was re-armed by a re-upload in between.
    const preview = previewBlobGc(s.deps, { graceMs: GRACE });
    await s.f.add('kept');
    const result = await applyBlobGc(s.deps, { plan: preview.plan, confirmToken: preview.confirmToken });
    expect(result.skipped).toEqual([{ sha256: kept, reason: 'within-grace' }]);
    expect(existsSync(s.file(kept))).toBe(true);
    expect(existsSync(s.file(young))).toBe(false);
  });

  it('refuses a grace period below the minimum and defaults to seven days', () => {
    const s = setup();
    expect(() => previewBlobGc(s.deps, { graceMs: GRACE - 1 })).toThrow(BlobGcError);
    expect(() => previewBlobGc(s.deps, { graceMs: Number.NaN })).toThrow(BlobGcError);
    expect(previewBlobGc(s.deps).plan.graceMs).toBe(DEFAULT_BLOB_GC_GRACE_MS);
  });

  it('a held lease blocks apply and keeps the token valid; GC itself holds the lease and releases it, even on failure', async () => {
    const s = setup();
    const orphan = await s.f.add('orphan');
    s.f.advance(2 * GRACE);
    const preview = previewBlobGc(s.deps, { graceMs: GRACE });
    expect(tryAcquireBlobLease(s.f.db, 'backup', s.f.now())).toEqual({ acquired: true });
    const refusal = await s.refuse(() => applyBlobGc(s.deps, { plan: preview.plan, confirmToken: preview.confirmToken }));
    expect(refusal.code).toBe('lease-held');
    expect(refusal.message).toMatch(/backup/);
    expect(existsSync(s.file(orphan))).toBe(true);
    s.f.db.prepare("DELETE FROM meta WHERE key = 'blob_lease:backup'").run();
    // The same token still works once the lease is gone.
    expect((await applyBlobGc(s.deps, { plan: preview.plan, confirmToken: preview.confirmToken })).deleted).toBe(1);

    // While GC runs, the backup cannot take the lease; a store failure still releases it.
    const orphan2 = await s.f.add('orphan2');
    s.f.advance(2 * GRACE);
    const again = previewBlobGc(s.deps, { graceMs: GRACE });
    let backupDuringGc: unknown;
    const failingDeps = {
      ...s.deps,
      store: { delete: async () => { backupDuringGc = tryAcquireBlobLease(s.f.db, 'backup', s.f.now()); throw new Error('disk error'); } },
    };
    const outcome = await applyBlobGc(failingDeps, { plan: again.plan, confirmToken: again.confirmToken });
    expect(backupDuringGc).toEqual({ acquired: false, blockedBy: ['gc'] });
    expect(outcome.skipped).toEqual([{ sha256: orphan2, reason: 'delete-failed' }]);
    expect(activeBlobLeases(s.f.db, s.f.now())).toEqual([]);
    // The row stays `deleting` (refuses references) and the next GC retries it.
    expect(getBlobRow(s.f.db, orphan2)!.state).toBe('deleting');
    expect(() => addBlobRef(s.f.db, { sha256: orphan2, ownerKind: 'attachment', ownerId: 'x', now: s.f.now() })).toThrow(/being deleted/);
    const retry = previewBlobGc(s.deps, { graceMs: GRACE });
    expect(retry.plan.blobs.map((b) => b.sha256)).toEqual([orphan2]);
    expect((await applyBlobGc(s.deps, { plan: retry.plan, confirmToken: retry.confirmToken })).deleted).toBe(1);
    expect(existsSync(s.file(orphan2))).toBe(false);
  });

  it('an expired lease does not block apply, and a lease taken by a crashed GC expires on its own', async () => {
    const s = setup();
    await s.f.add('orphan');
    s.f.advance(2 * GRACE);
    tryAcquireBlobLease(s.f.db, 'backup', s.f.now(), HOUR / 2);
    s.f.advance(HOUR);
    const preview = previewBlobGc(s.deps, { graceMs: GRACE });
    expect((await applyBlobGc(s.deps, { plan: preview.plan, confirmToken: preview.confirmToken })).deleted).toBe(1);
  });
});
