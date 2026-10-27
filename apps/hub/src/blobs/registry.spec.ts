import { afterEach, describe, expect, it } from 'vitest';
import { transaction } from '@dude/sqlite-store';
import { openBlobFixture } from './blob-fixture.js';
import { BlobCatalogueError, addBlobRef, blobRefCount, getBlobRow, recordBlob, removeBlobRef, removeOwnerBlobRefs } from './registry.js';
import { activeBlobLeases, releaseBlobLease, tryAcquireBlobLease } from './lease.js';

const fixtures: Array<ReturnType<typeof openBlobFixture>> = [];
const fixture = () => { const f = openBlobFixture(); fixtures.push(f); return f; };
afterEach(() => { for (const f of fixtures.splice(0)) f.close(); });

describe('blob catalogue and reference counts', () => {
  it('records a blob unreferenced, counts distinct references and clears or restarts the grace clock', async () => {
    const f = fixture();
    const sha = await f.add('doc');
    expect(getBlobRow(f.db, sha)).toMatchObject({ state: 'ok', size: 3, verifiedAt: null, unreferencedSince: '2026-10-27T12:00:00.000Z' });
    expect(blobRefCount(f.db, sha)).toBe(0);

    f.advance(1000);
    expect(addBlobRef(f.db, { sha256: sha, ownerKind: 'attachment', ownerId: 'a1', now: f.now() })).toBe(true);
    expect(addBlobRef(f.db, { sha256: sha, ownerKind: 'attachment', ownerId: 'a1', now: f.now() })).toBe(false);
    expect(addBlobRef(f.db, { sha256: sha, ownerKind: 'attachment', ownerId: 'a2', now: f.now() })).toBe(true);
    expect(addBlobRef(f.db, { sha256: sha, ownerKind: 'derived', ownerId: 'a1', now: f.now() })).toBe(true);
    expect(blobRefCount(f.db, sha)).toBe(3);
    expect(getBlobRow(f.db, sha)!.unreferencedSince).toBeNull();

    f.advance(1000);
    expect(removeBlobRef(f.db, { sha256: sha, ownerKind: 'attachment', ownerId: 'a1', now: f.now() })).toBe(true);
    expect(removeBlobRef(f.db, { sha256: sha, ownerKind: 'attachment', ownerId: 'a1', now: f.now() })).toBe(false);
    expect(blobRefCount(f.db, sha)).toBe(2);
    expect(getBlobRow(f.db, sha)!.unreferencedSince).toBeNull();
    expect(removeOwnerBlobRefs(f.db, 'attachment', 'a2', f.now())).toBe(1);
    expect(getBlobRow(f.db, sha)!.unreferencedSince).toBeNull();
    f.advance(1000);
    expect(removeBlobRef(f.db, { sha256: sha, ownerKind: 'derived', ownerId: 'a1', now: f.now() })).toBe(true);
    expect(blobRefCount(f.db, sha)).toBe(0);
    expect(getBlobRow(f.db, sha)!.unreferencedSince).toBe('2026-10-27T12:00:03.000Z');

    // Storing the same content again restarts the grace clock of an unreferenced blob.
    f.advance(5000);
    await f.add('doc');
    expect(getBlobRow(f.db, sha)!.unreferencedSince).toBe('2026-10-27T12:00:08.000Z');
  });

  it('refuses a reference to an unrecorded or deleting blob, bad owners and bad hashes', async () => {
    const f = fixture();
    expect(() => addBlobRef(f.db, { sha256: 'c'.repeat(64), ownerKind: 'attachment', ownerId: 'x', now: 0 })).toThrow(BlobCatalogueError);
    const sha = await f.add('x');
    expect(() => addBlobRef(f.db, { sha256: sha, ownerKind: 'Bad Kind', ownerId: 'x', now: 0 })).toThrow(BlobCatalogueError);
    expect(() => addBlobRef(f.db, { sha256: sha, ownerKind: 'attachment', ownerId: '', now: 0 })).toThrow(BlobCatalogueError);
    expect(() => addBlobRef(f.db, { sha256: '../x', ownerKind: 'attachment', ownerId: 'x', now: 0 })).toThrow();
    f.db.prepare("UPDATE blobs SET state = 'deleting' WHERE sha256 = ?").run(sha);
    expect(() => addBlobRef(f.db, { sha256: sha, ownerKind: 'attachment', ownerId: 'x', now: 0 })).toThrow(/being deleted/);
    expect(() => recordBlob(f.db, { sha256: sha, size: 1, now: 0 })).toThrow(/being deleted/);
  });

  it('works inside the caller transaction: a rollback undoes the record and the reference together', async () => {
    const f = fixture();
    const put = await f.store.put(Buffer.from('atomic'));
    expect(() => transaction(f.db, () => {
      recordBlob(f.db, { sha256: put.sha256, size: put.size, now: f.now(), created: true });
      addBlobRef(f.db, { sha256: put.sha256, ownerKind: 'attachment', ownerId: 'i1', now: f.now() });
      throw new Error('abort');
    })).toThrow('abort');
    expect(getBlobRow(f.db, put.sha256)).toBeUndefined();
    expect(f.db.prepare('SELECT COUNT(*) AS n FROM blob_refs').get()).toEqual({ n: 0 });
  });

  it('heals a missing row only when the bytes were really re-written, and rejects a size change', async () => {
    const f = fixture();
    const sha = await f.add('heal');
    f.db.prepare("UPDATE blobs SET state = 'missing' WHERE sha256 = ?").run(sha);
    recordBlob(f.db, { sha256: sha, size: 4, now: f.now(), created: false });
    expect(getBlobRow(f.db, sha)!.state).toBe('missing');
    recordBlob(f.db, { sha256: sha, size: 4, now: f.now(), created: true });
    expect(getBlobRow(f.db, sha)!.state).toBe('ok');
    expect(() => recordBlob(f.db, { sha256: sha, size: 5, now: f.now() })).toThrow(/size/);
  });
});

describe('blob lease', () => {
  it('is mutually exclusive between holders, expires on its own and is released explicitly', () => {
    const f = fixture();
    expect(tryAcquireBlobLease(f.db, 'backup', 1000, 5000)).toEqual({ acquired: true });
    expect(tryAcquireBlobLease(f.db, 'gc', 2000)).toEqual({ acquired: false, blockedBy: ['backup'] });
    expect(tryAcquireBlobLease(f.db, 'backup', 2000, 5000)).toEqual({ acquired: true });
    expect(activeBlobLeases(f.db, 3000).map((l) => l.holder)).toEqual(['backup']);
    expect(tryAcquireBlobLease(f.db, 'gc', 7001)).toEqual({ acquired: true });
    releaseBlobLease(f.db, 'gc');
    releaseBlobLease(f.db, 'backup');
    expect(activeBlobLeases(f.db, 0)).toEqual([]);
  });
});
