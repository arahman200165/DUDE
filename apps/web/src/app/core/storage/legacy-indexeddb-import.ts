import type { PlatformBridge } from '@dude/contracts/shared/models/platform-bridge.model';
import type { BootSnapshot } from '../persistence/device-store/boot-snapshot';

/**
 * Shared plumbing for the one-shot move of a legacy renderer IndexedDB database into the Device Store
 * (Phase 31B, M625). Each caller supplies how its rows are added; this owns the marker, the read and the
 * delete. Idempotent: the marker is committed only after every row was handed over, and the database is
 * deleted only after that, so a failure at any step retries on the next launch.
 */

export const IMPORT_MARKER_KEY = 'done';

export async function legacyDatabaseExists(name: string): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false;
  const list = (indexedDB as IDBFactory & { databases?: () => Promise<Array<{ name?: string }>> }).databases;
  if (typeof list !== 'function') return true;
  try {
    return (await list.call(indexedDB)).some((db) => db.name === name);
  } catch {
    return true;
  }
}

/** Reads every row of `store`; resolves empty when the database has no such store. */
export function readLegacyStore(name: string, store: string): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(name);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(store)) {
        db.close();
        resolve([]);
        return;
      }
      const request = db.transaction(store, 'readonly').objectStore(store).getAll();
      request.onsuccess = () => { db.close(); resolve(request.result as unknown[]); };
      request.onerror = () => { db.close(); reject(request.error); };
    };
  });
}

/** Deletes a database; a connection that stays open elsewhere only delays the delete, so `blocked` resolves too. */
export function deleteLegacyDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { resolve(); return; }
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export function hasImportMarker(snapshot: BootSnapshot, namespace: string): boolean {
  return snapshot.boot?.kv.some((row) => row.namespace === namespace && row.key === IMPORT_MARKER_KEY) === true;
}

export interface LegacyImportSpec {
  readonly dbName: string;
  readonly storeName: string;
  readonly markerNamespace: string;
  readonly snapshot: BootSnapshot;
  readonly bridge: Pick<PlatformBridge['store'], 'commitKv'>;
  /** Hands every row over, oldest first as the caller sees fit. Throwing aborts without a marker. */
  readonly importRows: (rows: readonly unknown[]) => Promise<void>;
}

export type LegacyImportOutcome = 'already-done' | 'imported' | 'nothing-to-import';

export async function runLegacyIndexedDbImport(spec: LegacyImportSpec): Promise<LegacyImportOutcome> {
  const exists = await legacyDatabaseExists(spec.dbName);
  if (hasImportMarker(spec.snapshot, spec.markerNamespace)) {
    // A previous launch committed the marker but may not have managed to delete the database.
    if (exists) await deleteLegacyDatabase(spec.dbName).catch(() => undefined);
    return 'already-done';
  }
  let outcome: LegacyImportOutcome = 'nothing-to-import';
  if (exists) {
    await spec.importRows(await readLegacyStore(spec.dbName, spec.storeName));
    outcome = 'imported';
  }
  const commit = await spec.bridge.commitKv([{ namespace: spec.markerNamespace, key: IMPORT_MARKER_KEY, value: true, policy: 'local' }]);
  if (!commit.ok) throw new Error(`Could not record the ${spec.markerNamespace} marker: ${commit.error}`);
  if (exists) await deleteLegacyDatabase(spec.dbName);
  return outcome;
}
