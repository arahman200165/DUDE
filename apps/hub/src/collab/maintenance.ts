import * as Y from 'yjs';
import { allRows, getRow, transaction } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { parseCollabDocKey } from '@dude/collab-doc';
import { getCanonicalRecord } from '../db/canonical-repository.js';
import { getSyncFloor } from '../db/sync-repository.js';
import type { JobHandle, JobRunReport } from '../jobs/job-status.js';
import type { CollabLog } from './doc-store.js';
import type { CollabRegistry } from './doc-registry.js';

export interface CollabMaintenanceResult {
  /** Merge bases below the sync floor that were not their document's newest. */
  basesPruned: number;
  /** Merge bases of documents with no stored row or no live record. */
  orphanBases: number;
  /** Stored (not loaded) documents whose update tail was folded into their state. */
  compacted: number;
  /** Stored documents whose tail could not be compacted (left untouched). */
  failed: number;
}

export interface CollabMaintenanceOptions {
  db: Db;
  registry: Pick<CollabRegistry, 'store' | 'loadedKeys'>;
  log?: CollabLog;
}

/**
 * The `collab-maintenance` pass (PD-105). `collab_bases` grows with every materialization; a client based on a revision below the
 * sync floor is answered `cursor-expired` anyway, so those bases are useless, but each document's NEWEST base is always kept (it is
 * the merge base for a write based on the current materialization). Bases whose document row or live record is gone are removed
 * (a loaded document is left alone). A stored document that is not loaded and still has an update tail is compacted into its state.
 */
export function runCollabMaintenance(options: CollabMaintenanceOptions): CollabMaintenanceResult {
  const { db, registry } = options;
  const loaded = new Set(registry.loadedKeys());
  const floor = getSyncFloor(db);

  const basesPruned = Number(db.prepare(
    `DELETE FROM collab_bases
      WHERE revision < ?
        AND revision < (SELECT MAX(newest.revision) FROM collab_bases AS newest WHERE newest.doc_key = collab_bases.doc_key)`,
  ).run(floor).changes);

  const environmentId = getRow<{ environment_id: string }>(db.prepare('SELECT environment_id FROM environment LIMIT 1'))?.environment_id;
  const hasRow = db.prepare('SELECT 1 AS x FROM collab_docs WHERE doc_key = ?');
  const orphanKeys = allRows<{ doc_key: string }>(db.prepare('SELECT DISTINCT doc_key FROM collab_bases')).map((r) => r.doc_key).filter((docKey) => {
    if (loaded.has(docKey)) return false;
    if (hasRow.get(docKey) === undefined) return true;
    const ref = parseCollabDocKey(docKey);
    if (!ref || ref.kind === 'room' || environmentId === undefined) return true;
    const record = getCanonicalRecord(db, environmentId, ref.kind, ref.id);
    return record === undefined || record.deleted;
  });
  let orphanBases = 0;
  if (orphanKeys.length > 0) {
    const del = db.prepare('DELETE FROM collab_bases WHERE doc_key = ?');
    transaction(db, () => {
      for (const docKey of orphanKeys) orphanBases += Number(del.run(docKey).changes);
    });
  }

  let compacted = 0;
  let failed = 0;
  const tailed = allRows<{ doc_key: string }>(db.prepare(
    'SELECT DISTINCT u.doc_key FROM collab_updates AS u JOIN collab_docs AS d ON d.doc_key = u.doc_key ORDER BY u.doc_key',
  )).map((r) => r.doc_key).filter((docKey) => !loaded.has(docKey));
  for (const docKey of tailed) {
    const doc = new Y.Doc();
    try {
      registry.store.flush(docKey);
      const row = getRow<{ state: Uint8Array }>(db.prepare('SELECT state FROM collab_docs WHERE doc_key = ?'), docKey);
      if (!row) continue;
      Y.applyUpdate(doc, row.state);
      for (const entry of allRows<{ update_blob: Uint8Array }>(db.prepare('SELECT update_blob FROM collab_updates WHERE doc_key = ? ORDER BY seq'), docKey)) {
        Y.applyUpdate(doc, entry.update_blob);
      }
      registry.store.compact(docKey, doc);
      compacted += 1;
    } catch (error) {
      failed += 1;
      options.log?.warn({ event: 'collab.maintenance-compact-failed', doc: docKey, code: (error as { code?: unknown }).code }, 'A stored collaborative document could not be compacted.');
    } finally {
      doc.destroy();
    }
  }
  return { basesPruned, orphanBases, compacted, failed };
}

export function classifyCollabMaintenance(result: CollabMaintenanceResult): JobRunReport {
  if (result.failed > 0) return { outcome: 'failed', summary: `${result.failed} stored documents could not be compacted.` };
  const bases = result.basesPruned + result.orphanBases;
  if (bases === 0 && result.compacted === 0) return { outcome: 'success', summary: 'Nothing needed pruning or compaction.' };
  return { outcome: 'success', summary: `Removed ${bases} merge bases and compacted ${result.compacted} stored documents.` };
}

/** The `collab-maintenance` job (PD-112): runs once now and then every `intervalMs` (0: no timer), reported to the job registry. */
export function startCollabMaintenance(options: CollabMaintenanceOptions & { intervalMs: number; job?: JobHandle }): () => void {
  const run = (): void => {
    try {
      const pass = (): CollabMaintenanceResult => runCollabMaintenance(options);
      if (options.job) options.job.track(pass, classifyCollabMaintenance);
      else pass();
    } catch { /* the database may be closing; the failure is already recorded by the job registry */ }
  };
  run();
  if (options.intervalMs <= 0) return () => undefined;
  const timer = setInterval(run, options.intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
