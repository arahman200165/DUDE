import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { historyRepositoryContract, networkRunRepositoryContract } from '@dude/persistence/testing';
import { JsonJournal } from '../../../../desktop/mutation-core.js';
import { cleanupTemp, openReady, tempDir } from '../../testing/test-utils.js';
import { SqliteHistoryRepository } from './history.repo.js';
import { SqliteNetworkRunRepository } from './network-runs.repo.js';
import { appendJournal, getJournal, listJournal, removeJournal, trimJournal, updateJournal } from './journal.repo.js';
import type { JournalEntryBase } from './journal.repo.js';
import { getSnapshotHeader, listSnapshotHeaders, removeSnapshotHeader, upsertSnapshotHeader } from './snapshots.repo.js';
import { addPowerShellHistory, clearPowerShellHistory, listPowerShellHistory } from './powershell-history.repo.js';
import { getDoc, removeDoc, setDoc } from './device-docs.repo.js';
import { getSecretCiphertext, listSecretStatus, removeSecret, secretStatus, setSecretCiphertext } from './secrets.repo.js';
import { DEFAULT_HISTORY_RETENTION, DEFAULT_NETWORK_RUN_RETENTION } from './retention.js';

afterEach(cleanupTemp);
const harness = { describe, it, expect };

historyRepositoryContract('SQLite', (retention, clock) => new SqliteHistoryRepository(openReady(tempDir()).db, retention, clock.now), harness);
networkRunRepositoryContract('SQLite', (retention, clock) => new SqliteNetworkRunRepository(openReady(tempDir()).db, retention, clock.now), harness);

describe('retention defaults', () => {
  it('match the renderer caps', () => {
    expect(DEFAULT_HISTORY_RETENTION).toEqual({ maxPerTool: 200, maxTotal: 5000, maxAgeMs: 90 * 86_400_000, maxEntryBytes: 262_144 });
    expect(DEFAULT_NETWORK_RUN_RETENTION).toEqual({ maxRuns: 100, maxAgeMs: 30 * 86_400_000, maxTotalBytes: 50_000_000 });
  });
});

const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const entry = (n: number, at: string, extra: Record<string, unknown> = {}): JournalEntryBase & Record<string, unknown> => ({ planId: id(n), appliedAt: at, title: `plan ${n}`, ...extra });

describe('journal repo', () => {
  const fixtures = [
    entry(1, '2025-01-01T00:00:00.000Z'),
    entry(2, '2025-03-01T00:00:00.000Z'),
    entry(3, '2025-02-01T00:00:00.000Z'),
    entry(4, '2025-04-01T00:00:00.000Z'),
    entry(5, '2024-12-01T00:00:00.000Z'),
  ];

  it('matches JsonJournal ordering, get, overwrite, remove and trim semantics', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'dude-journal-parity-'));
    try {
      const json = new JsonJournal<JournalEntryBase>(() => dir, 3);
      const db = openReady(tempDir()).db;
      for (const e of fixtures) { await json.write(e); appendJournal(db, 'fs', e); }
      expect(listJournal(db, 'fs')).toEqual(await json.list());
      expect(getJournal(db, 'fs', id(2))).toEqual(await json.read(id(2)));
      expect(getJournal(db, 'fs', id(99))).toEqual(await json.read(id(99)));
      expect(getJournal(db, 'fs', 'not-an-id')).toBeNull();

      const replaced = entry(2, '2025-03-01T00:00:00.000Z', { title: 'changed' });
      await json.write(replaced);
      appendJournal(db, 'fs', replaced);
      expect(listJournal(db, 'fs')).toEqual(await json.list());

      const removedJson: string[] = [];
      await json.trimTo(3, (e) => { removedJson.push(e.planId); });
      const removedSql = trimJournal(db, 'fs', 3).map((e) => e.planId);
      expect(removedSql).toEqual(removedJson);
      expect(listJournal(db, 'fs')).toEqual(await json.list());
      expect(listJournal(db, 'fs').map((e) => e.planId)).toEqual([id(4), id(2), id(3)]);

      await json.remove(id(2));
      removeJournal(db, 'fs', id(2));
      expect(listJournal(db, 'fs')).toEqual(await json.list());
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps fs and sys separate, supports limit, update and invalid ids', () => {
    const db = openReady(tempDir()).db;
    appendJournal(db, 'fs', entry(1, '2025-01-01T00:00:00.000Z'));
    appendJournal(db, 'sys', entry(1, '2025-01-02T00:00:00.000Z'));
    appendJournal(db, 'sys', entry(2, '2025-01-03T00:00:00.000Z'));
    expect(listJournal(db, 'fs')).toHaveLength(1);
    expect(listJournal(db, 'sys', 1).map((e) => e.planId)).toEqual([id(2)]);
    expect(updateJournal(db, 'fs', id(1), entry(1, '2025-01-01T00:00:00.000Z', { undone: true }))).toBe(true);
    expect(getJournal(db, 'fs', id(1))).toMatchObject({ undone: true });
    expect(updateJournal(db, 'fs', id(9), entry(9, '2025-01-01T00:00:00.000Z'))).toBe(false);
    expect(() => appendJournal(db, 'fs', { planId: 'bad', appliedAt: '2025-01-01T00:00:00.000Z' })).toThrow(/Invalid journal id/);
    expect(() => appendJournal(db, 'other' as 'fs', entry(3, '2025-01-01T00:00:00.000Z'))).toThrow(/engine/);
  });
});

describe('snapshot headers', () => {
  it('upserts, lists newest first per kind, gets and removes', () => {
    const db = openReady(tempDir()).db;
    upsertSnapshotHeader(db, 'fs', 'a', 10, { label: 'a' });
    upsertSnapshotHeader(db, 'fs', 'b', 20, { label: 'b' });
    upsertSnapshotHeader(db, 'env', 'c', 30, { name: 'c' });
    upsertSnapshotHeader(db, 'fs', 'a', 40, { label: 'a2' });
    expect(listSnapshotHeaders(db, 'fs').map((r) => r.id)).toEqual(['a', 'b']);
    expect(getSnapshotHeader(db, 'fs', 'a')?.header).toEqual({ label: 'a2' });
    expect(removeSnapshotHeader(db, 'fs', 'a')).toBe(true);
    expect(removeSnapshotHeader(db, 'fs', 'a')).toBe(false);
    expect(listSnapshotHeaders(db, 'env')).toHaveLength(1);
  });
});

describe('powershell history', () => {
  it('lists newest first and retains the newest 100', () => {
    const db = openReady(tempDir()).db;
    for (let i = 0; i < 105; i++) addPowerShellHistory(db, { id: `r${i}`, completedAt: new Date(1_700_000_000_000 + i * 1000).toISOString() });
    const all = listPowerShellHistory<{ id: string }>(db);
    expect(all).toHaveLength(100);
    expect(all[0].id).toBe('r104');
    expect(all[99].id).toBe('r5');
    clearPowerShellHistory(db);
    expect(listPowerShellHistory(db)).toEqual([]);
  });
});

describe('device docs', () => {
  it('round-trips, removes and validates names', () => {
    const db = openReady(tempDir()).db;
    expect(getDoc(db, 'preferences')).toBeUndefined();
    setDoc(db, 'preferences', { a: 1 });
    setDoc(db, 'preferences', { a: 2 });
    expect(getDoc(db, 'preferences')).toEqual({ a: 2 });
    expect(removeDoc(db, 'preferences')).toBe(true);
    expect(removeDoc(db, 'preferences')).toBe(false);
    for (const bad of ['', 'Upper', '-x', 'a/b', 'a'.repeat(65), '../x']) expect(() => setDoc(db, bad, 1)).toThrow(/Invalid document name/);
    setDoc(db, 'window-bounds.v1', {});
  });
});

describe('secrets repo', () => {
  const t = (ms: number): Date => new Date(ms);

  it('stores ciphertext atomically, keeps the ref, clears needs_reentry and never exposes plaintext in status', () => {
    const db = openReady(tempDir()).db;
    expect(secretStatus(db, 'ai.llmApiKey')).toEqual({ purpose: 'ai.llmApiKey', isSet: false, needsReentry: false, createdAt: null, lastUsedAt: null });
    const ref1 = setSecretCiphertext(db, 'ai.llmApiKey', new Uint8Array([1, 2, 3]), t(1000), () => 'secret:one');
    db.exec('UPDATE secret_refs SET needs_reentry = 1');
    expect(secretStatus(db, 'ai.llmApiKey').needsReentry).toBe(true);
    const ref2 = setSecretCiphertext(db, 'ai.llmApiKey', new Uint8Array([9, 9]), t(2000), () => 'secret:two');
    expect(ref2).toBe(ref1);
    const status = secretStatus(db, 'ai.llmApiKey');
    expect(status).toEqual({ purpose: 'ai.llmApiKey', isSet: true, needsReentry: false, createdAt: new Date(1000).toISOString(), lastUsedAt: null });
    expect(JSON.stringify(status)).not.toMatch(/ciphertext|plaintext/i);
    expect(getSecretCiphertext(db, 'ai.llmApiKey', t(3000))).toEqual(new Uint8Array([9, 9]));
    expect(secretStatus(db, 'ai.llmApiKey').lastUsedAt).toBe(new Date(3000).toISOString());
    expect(listSecretStatus(db)).toHaveLength(1);
  });

  it('removes value with its ref and rejects unknown purposes', () => {
    const db = openReady(tempDir()).db;
    setSecretCiphertext(db, 'ai.llmApiKey', new Uint8Array([1]), t(1), () => 'secret:x');
    expect(removeSecret(db, 'ai.llmApiKey')).toBe(true);
    expect((db.prepare('SELECT COUNT(*) AS n FROM secret_values').get() as { n: number }).n).toBe(0);
    expect(getSecretCiphertext(db, 'ai.llmApiKey', t(2))).toBeNull();
    expect(() => setSecretCiphertext(db, 'nope' as 'ai.llmApiKey', new Uint8Array([1]), t(1), () => 'secret:y')).toThrow(/purpose/);
    expect(() => setSecretCiphertext(db, 'ai.llmApiKey', new Uint8Array(0), t(1), () => 'secret:y')).toThrow(/non-empty/);
  });
});
