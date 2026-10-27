import { UPLOAD_BLOB_OWNER_KIND } from '@dude/contracts/hub';
import { transaction } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { addBlobRef, removeBlobRef } from '../blobs/registry.js';

export class UploadAttachError extends Error {
  constructor(readonly code: 'not-found' | 'not-complete' | 'wrong-principal', message: string) {
    super(message);
    this.name = 'UploadAttachError';
  }
}

/**
 * The hook 32-SS3 calls when a capture (an item, an attachment) adopts a completed upload's blob: it adds the caller's own reference
 * (`ownerKind`, `ownerId`) and releases the session's `upload` reference in ONE transaction, so the blob is never unreferenced in
 * between (garbage collection cannot collect it) and the expiry job leaves the session alone afterwards. Idempotent for the same
 * owner. Run it inside the caller's transaction when the new reference must commit with the caller's own rows (nested transactions
 * join). `principal` (when given) must be the session's creator; an expired, aborted, failed or still-open session cannot be attached.
 */
export function attachUploadBlob(
  db: Db, uploadId: string, ownerKind: string, ownerId: string, now: number, principal?: { kind: string; id: string },
): { sha256: string; size: number } {
  return transaction(db, () => {
    const row = db.prepare('SELECT state, blob_sha256, declared_size, principal_kind, principal_id FROM uploads WHERE id = ?').get(uploadId) as
      { state: string; blob_sha256: string | null; declared_size: number; principal_kind: string; principal_id: string } | undefined;
    if (row === undefined) throw new UploadAttachError('not-found', 'That upload does not exist.');
    if (principal !== undefined && (row.principal_kind !== principal.kind || row.principal_id !== principal.id)) throw new UploadAttachError('wrong-principal', 'That upload belongs to another principal.');
    if (row.state !== 'complete' || row.blob_sha256 === null) throw new UploadAttachError('not-complete', 'Only a completed upload can be attached.');
    addBlobRef(db, { sha256: row.blob_sha256, ownerKind, ownerId, now });
    removeBlobRef(db, { sha256: row.blob_sha256, ownerKind: UPLOAD_BLOB_OWNER_KIND, ownerId: uploadId, now });
    db.prepare('UPDATE uploads SET attached_at = COALESCE(attached_at, ?), updated_at = ? WHERE id = ?').run(now, now, uploadId);
    return { sha256: row.blob_sha256, size: Number(row.declared_size) };
  });
}
