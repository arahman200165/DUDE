import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupTemp, commitContext, openReady, tempDir } from '../testing/test-utils.js';
import { commitEntity } from './entity-commit.js';
import { commitKvBatch } from './repos/kv.repo.js';
import { setSecretCiphertext, secretStatus } from './repos/secrets.repo.js';
import { setDoc } from './repos/device-docs.repo.js';
import { appendJournal } from './repos/journal.repo.js';
import { getMeta } from '@dude/sqlite-store';
import { applyReset, previewReset } from './reset.js';

afterEach(cleanupTemp);
const deps = { now: () => new Date(), randomBytes: (n: number) => new Uint8Array(randomBytes(n)) };

function populate() {
  const store = openReady(tempDir());
  commitKvBatch(store.db, [{ namespace: 'tool.a', key: 'k', value: 1, policy: 'local' }]);
  commitEntity(store.db, commitContext(store), { entityType: 'favorite', entityId: 'tool:x', op: 'upsert', payload: { id: 'tool:x', kind: 'tool', targetId: 'x', order: 0 } });
  setDoc(store.db, 'preferences', { a: 1 });
  appendJournal(store.db, 'fs', { planId: '00000000-0000-4000-8000-000000000001', appliedAt: '2025-01-01T00:00:00.000Z' });
  setSecretCiphertext(store.db, 'ai.llmApiKey', new Uint8Array([1, 2]), new Date(), () => 'secret:s1');
  return store;
}

const count = (store: ReturnType<typeof populate>, table: string): number => (store.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

describe('reset', () => {
  it('previews counts, flags and a stable digest', () => {
    const store = populate();
    const a = previewReset(store.db, 'clear-data');
    expect(a).toMatchObject({ kind: 'clear-data', keepsIdentity: true, wipesSecrets: false });
    expect(a.counts).toMatchObject({ kv: 1, records: 1, outbox: 1, device_docs: 1, mutation_journal: 1 });
    expect(a.counts.secret_refs).toBeUndefined();
    expect(previewReset(store.db, 'clear-data').digest).toBe(a.digest);
    const b = previewReset(store.db, 'reset-device');
    expect(b).toMatchObject({ keepsIdentity: false, wipesSecrets: true });
    expect(b.counts).toMatchObject({ secret_refs: 1, secret_values: 1 });
    expect(b.digest).not.toBe(a.digest);
  });

  it('rejects a stale digest and changes nothing', () => {
    const store = populate();
    const preview = previewReset(store.db, 'clear-data');
    commitKvBatch(store.db, [{ namespace: 'tool.a', key: 'k2', value: 2, policy: 'local' }]);
    expect(applyReset(store.db, 'clear-data', preview.digest, deps)).toEqual({ ok: false, error: 'stale-preview' });
    expect(count(store, 'kv')).toBe(2);
  });

  it('clear-data wipes rows but keeps identity and secrets', () => {
    const store = populate();
    const deviceId = getMeta(store.db, 'device_id');
    const result = applyReset(store.db, 'clear-data', previewReset(store.db, 'clear-data').digest, deps);
    expect(result).toEqual({ ok: true });
    for (const t of ['kv', 'records', 'outbox', 'history_entries', 'network_runs', 'mutation_journal', 'snapshot_headers', 'powershell_history', 'device_docs']) expect(count(store, t)).toBe(0);
    expect(getMeta(store.db, 'device_id')).toBe(deviceId);
    expect(secretStatus(store.db, 'ai.llmApiKey').isSet).toBe(true);
  });

  it('reset-device also wipes secrets and rotates device and environment ids', () => {
    const store = populate();
    const deviceId = getMeta(store.db, 'device_id');
    const environmentId = getMeta(store.db, 'environment_id');
    store.db.prepare("INSERT INTO meta(key, value) VALUES('cloned_from', 'old')").run();
    expect(applyReset(store.db, 'reset-device', previewReset(store.db, 'reset-device').digest, deps)).toEqual({ ok: true });
    expect(count(store, 'kv')).toBe(0);
    expect(count(store, 'secret_refs')).toBe(0);
    expect(count(store, 'secret_values')).toBe(0);
    expect(getMeta(store.db, 'device_id')).not.toBe(deviceId);
    expect(getMeta(store.db, 'environment_id')).not.toBe(environmentId);
    expect(getMeta(store.db, 'cloned_from')).toBeUndefined();
  });

  it('rejects a digest from the other kind', () => {
    const store = populate();
    const clear = previewReset(store.db, 'clear-data');
    expect(applyReset(store.db, 'reset-device', clear.digest, deps)).toEqual({ ok: false, error: 'stale-preview' });
  });
});
