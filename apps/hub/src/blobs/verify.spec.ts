import { closeSync, openSync, rmSync, writeSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openBlobFixture } from './blob-fixture.js';
import { getBlobRow } from './registry.js';
import { verifyBlobBatch } from './verify.js';

const fixtures: Array<ReturnType<typeof openBlobFixture>> = [];
const fixture = () => { const f = openBlobFixture(); fixtures.push(f); return f; };
afterEach(() => { for (const f of fixtures.splice(0)) f.close(); });

const blobFile = (f: ReturnType<typeof openBlobFixture>, sha: string) => path.join(f.paths.blobsDir, sha.slice(0, 2), sha.slice(2, 4), sha);
const outbox = (f: ReturnType<typeof openBlobFixture>) => f.db.prepare('SELECT event, outcome, payload_json FROM audit_outbox ORDER BY id').all() as Array<{ event: string; outcome: string; payload_json: string }>;

describe('verifyBlobBatch', () => {
  it('stamps healthy blobs, flags a bit flip and a missing file, and writes one outbox event for each failure', async () => {
    const f = fixture();
    const good = await f.add('good', 'a');
    const flipped = await f.add('flipped', 'b');
    const gone = await f.add('gone', 'c');
    const fd = openSync(blobFile(f, flipped), 'r+');
    writeSync(fd, Buffer.from([0xff]), 0, 1, 0);
    closeSync(fd);
    rmSync(blobFile(f, gone));
    let drains = 0;
    f.advance(60_000);
    const result = await verifyBlobBatch({ db: f.db, store: f.store, now: f.now, afterCommit: () => { drains += 1; } });
    expect(result).toEqual({ checked: 3, ok: 1, corrupt: [flipped], missing: [gone] });
    expect(drains).toBe(1);
    expect(getBlobRow(f.db, good)).toMatchObject({ state: 'ok', verifiedAt: '2026-10-27T12:01:00.000Z' });
    expect(getBlobRow(f.db, flipped)).toMatchObject({ state: 'corrupt', verifiedAt: '2026-10-27T12:01:00.000Z' });
    expect(getBlobRow(f.db, gone)!.state).toBe('missing');
    const rows = outbox(f);
    expect(rows.map((r) => [r.event, r.outcome])).toEqual([['blobs.verify-failed', 'failure'], ['blobs.verify-failed', 'failure']]);
    expect(rows.map((r) => JSON.parse(r.payload_json))).toEqual(expect.arrayContaining([
      { sha256: flipped, reason: 'corrupt', size: 7 }, { sha256: gone, reason: 'missing', size: 4 },
    ]));

    // Flagged blobs are not re-checked (no repeat report); a healthy second run is silent.
    f.advance(60_000);
    expect(await verifyBlobBatch({ db: f.db, store: f.store, now: f.now })).toEqual({ checked: 1, ok: 1, corrupt: [], missing: [] });
    expect(outbox(f)).toHaveLength(2);
  });

  it('takes the least recently verified blobs first and honours the batch limit', async () => {
    const f = fixture();
    const shas: string[] = [];
    for (const name of ['one', 'two', 'three', 'four']) shas.push(await f.add(name, name));
    f.advance(1000);
    const first = await verifyBlobBatch({ db: f.db, store: f.store, now: f.now, limit: 2 });
    expect(first.checked).toBe(2);
    const stamped = shas.filter((s) => getBlobRow(f.db, s)!.verifiedAt !== null);
    expect(stamped).toHaveLength(2);
    f.advance(1000);
    await verifyBlobBatch({ db: f.db, store: f.store, now: f.now, limit: 2 });
    // The second run went to the two never-verified blobs, not the two already stamped.
    expect(shas.every((s) => getBlobRow(f.db, s)!.verifiedAt !== null)).toBe(true);
    expect(stamped.every((s) => getBlobRow(f.db, s)!.verifiedAt === '2026-10-27T12:00:01.000Z')).toBe(true);
  });

  it('skips a blob that garbage collection claimed, and an empty catalogue is a no-op', async () => {
    const f = fixture();
    expect(await verifyBlobBatch({ db: f.db, store: f.store, now: f.now })).toEqual({ checked: 0, ok: 0, corrupt: [], missing: [] });
    const sha = await f.add('claimed');
    const claiming = { verify: async (s: string) => { f.db.prepare("UPDATE blobs SET state = 'deleting' WHERE sha256 = ?").run(s); rmSync(blobFile(f, s)); return f.store.verify(s); } };
    const result = await verifyBlobBatch({ db: f.db, store: claiming, now: f.now });
    expect(result.checked).toBe(0);
    expect(getBlobRow(f.db, sha)!.state).toBe('deleting');
    expect(outbox(f)).toEqual([]);
  });
});
