import { afterEach, describe, expect, it } from 'vitest';
import { wipeHubWebOrigin } from '@dude/persistence';
import { createWindowStorageBackend } from '../persistence/window-storage-backend';
import {
  AUTHORITY_STORAGE_KEY, checkBrowserAuthority, evaluateBrowserAuthority, forgetPreviousAuthority, readAuthorityRecord, writeAuthorityRecord,
  type AuthorityRecord,
} from './hub-web-authority';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
const rec = (hubInstanceId: string, authorityEpoch: number): AuthorityRecord => ({ hubInstanceId, authorityEpoch });

describe('evaluateBrowserAuthority', () => {
  it('accepts anything when nothing is stored, defaulting the epoch to 1', () => {
    expect(evaluateBrowserAuthority(null, { hubInstanceId: A })).toEqual({ kind: 'ok', record: rec(A, 1) });
    expect(evaluateBrowserAuthority(null, { hubInstanceId: A, authorityEpoch: 7, authorityState: 'active' })).toEqual({ kind: 'ok', record: rec(A, 7) });
  });

  it('refuses a transferred Hub before anything else, stored record or not', () => {
    expect(evaluateBrowserAuthority(null, { hubInstanceId: A, authorityState: 'transferred' })).toEqual({ kind: 'transferred' });
    expect(evaluateBrowserAuthority(rec(A, 2), { hubInstanceId: A, authorityEpoch: 2, authorityState: 'transferred' })).toEqual({ kind: 'transferred' });
    // Even a lower epoch reads as transferred first.
    expect(evaluateBrowserAuthority(rec(A, 5), { hubInstanceId: A, authorityEpoch: 1, authorityState: 'transferred' })).toEqual({ kind: 'transferred' });
  });

  it('same instance: equal or higher epoch is ok, lower is older', () => {
    expect(evaluateBrowserAuthority(rec(A, 3), { hubInstanceId: A, authorityEpoch: 3 })).toEqual({ kind: 'ok', record: rec(A, 3) });
    expect(evaluateBrowserAuthority(rec(A, 3), { hubInstanceId: A, authorityEpoch: 4 })).toEqual({ kind: 'ok', record: rec(A, 4) });
    expect(evaluateBrowserAuthority(rec(A, 3), { hubInstanceId: A, authorityEpoch: 2 })).toEqual({ kind: 'older', storedEpoch: 3, seenEpoch: 2 });
  });

  it('same instance with an absent epoch reads as 1 (an older Hub build) and is older than a stored higher epoch', () => {
    expect(evaluateBrowserAuthority(rec(A, 2), { hubInstanceId: A })).toEqual({ kind: 'older', storedEpoch: 2, seenEpoch: 1 });
    expect(evaluateBrowserAuthority(rec(A, 1), { hubInstanceId: A })).toEqual({ kind: 'ok', record: rec(A, 1) });
  });

  it('different instance (a restore): only a strictly higher epoch is ok', () => {
    expect(evaluateBrowserAuthority(rec(A, 3), { hubInstanceId: B, authorityEpoch: 4 })).toEqual({ kind: 'ok', record: rec(B, 4) });
    expect(evaluateBrowserAuthority(rec(A, 3), { hubInstanceId: B, authorityEpoch: 3 })).toEqual({ kind: 'older', storedEpoch: 3, seenEpoch: 3 });
    expect(evaluateBrowserAuthority(rec(A, 3), { hubInstanceId: B, authorityEpoch: 2 })).toEqual({ kind: 'older', storedEpoch: 3, seenEpoch: 2 });
    expect(evaluateBrowserAuthority(rec(A, 3), { hubInstanceId: B })).toEqual({ kind: 'older', storedEpoch: 3, seenEpoch: 1 });
  });

  it('the stored epoch never decreases for one instance: ok always returns the seen (>=) record', () => {
    for (const seen of [3, 4, 9]) {
      const verdict = evaluateBrowserAuthority(rec(A, 3), { hubInstanceId: A, authorityEpoch: seen });
      expect(verdict.kind === 'ok' && verdict.record.authorityEpoch).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('authority record storage and gate', () => {
  const local = createWindowStorageBackend('local');
  afterEach(() => local.remove(AUTHORITY_STORAGE_KEY));

  it('round-trips the record and treats anything malformed as none', () => {
    expect(readAuthorityRecord(local)).toBeNull();
    writeAuthorityRecord(local, rec(A, 2));
    expect(readAuthorityRecord(local)).toEqual(rec(A, 2));
    for (const bad of ['not json', '{}', '{"hubInstanceId":"x","authorityEpoch":0}', '{"hubInstanceId":"x","authorityEpoch":1.5}', '{"hubInstanceId":"","authorityEpoch":1}', 'null']) {
      local.set(AUTHORITY_STORAGE_KEY, bad);
      expect(readAuthorityRecord(local)).toBeNull();
    }
  });

  it('ok persists the seen record', async () => {
    expect(await checkBrowserAuthority(async () => ({ hubInstanceId: A, authorityEpoch: 2 }), local)).toEqual({ kind: 'ok' });
    expect(readAuthorityRecord(local)).toEqual(rec(A, 2));
  });

  it('transferred blocks and leaves the record alone', async () => {
    writeAuthorityRecord(local, rec(A, 2));
    const result = await checkBrowserAuthority(async () => ({ hubInstanceId: A, authorityEpoch: 2, authorityState: 'transferred' }), local);
    expect(result).toEqual({ kind: 'blocked', block: { kind: 'transferred' } });
    expect(readAuthorityRecord(local)).toEqual(rec(A, 2));
  });

  it('older blocks with the facts; forgetting replaces the record so the next gate passes', async () => {
    writeAuthorityRecord(local, rec(A, 5));
    const hello = async () => ({ hubInstanceId: B, authorityEpoch: 2 });
    const result = await checkBrowserAuthority(hello, local);
    expect(result).toEqual({ kind: 'blocked', block: { kind: 'older', storedEpoch: 5, seenEpoch: 2, seen: rec(B, 2) } });
    expect(readAuthorityRecord(local)).toEqual(rec(A, 5));
    if (result.kind !== 'blocked' || result.block.kind !== 'older') throw new Error('expected older');
    forgetPreviousAuthority(local, result.block.seen);
    expect(readAuthorityRecord(local)).toEqual(rec(B, 2));
    expect(await checkBrowserAuthority(hello, local)).toEqual({ kind: 'ok' });
  });

  it('a failed hello is unknown and stores nothing', async () => {
    expect(await checkBrowserAuthority(async () => { throw new Error('down'); }, local)).toEqual({ kind: 'unknown' });
    expect(readAuthorityRecord(local)).toBeNull();
  });
});

describe('authority record and sign-out (its local-only scope is asserted in @dude/persistence)', () => {
  it('is wiped by sign-out with the rest of the origin: losing it only drops the downgrade guard, never data', async () => {
    const storage = new Map<string, string>();
    const fake = { clear: () => storage.clear() };
    storage.set(AUTHORITY_STORAGE_KEY, JSON.stringify(rec(A, 3)));
    storage.set('dude:v1:settings:appearance', '{}');
    await wipeHubWebOrigin({ local: fake, session: { clear: () => undefined }, knownDatabases: [] });
    expect(storage.has(AUTHORITY_STORAGE_KEY)).toBe(false);
    // After the wipe the next sign-in has no record, so the gate accepts the Hub and stores a fresh one.
    expect(evaluateBrowserAuthority(null, { hubInstanceId: B, authorityEpoch: 1 }).kind).toBe('ok');
  });
});
