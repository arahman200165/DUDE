/** Where a sign-in-less browser keeps DUDE data: Web Storage, and IndexedDB databases created by name. */
export interface WipeStorage {
  clear(): void;
}

export interface WipeIdb {
  /** Absent in browsers without `indexedDB.databases()` (older Firefox); the known names are deleted anyway. */
  databases?(): Promise<readonly { name?: string | undefined }[]>;
  /** Resolves when the database is gone or the delete is queued behind open connections (they close as the page unloads). */
  deleteDatabase(name: string): Promise<void>;
}

export interface WipeHubWebOriginDeps {
  readonly local: WipeStorage;
  readonly session: WipeStorage;
  readonly idb?: WipeIdb | undefined;
  /** Every IndexedDB database the app creates by name. */
  readonly knownDatabases: readonly string[];
}

export interface WipeResult {
  readonly databases: readonly string[];
  readonly failures: number;
}

/**
 * Sign-out wipe (PD-053): `localStorage` (the installation id included), `sessionStorage` and every IndexedDB
 * database of this origin. It deliberately has no handle on Cache Storage: the service worker caches the app shell and
 * tool chunks only (never `/api` or `/sandbox`), those are public, and dropping them would break offline loads.
 * Never throws; a store that cannot be cleared is counted in `failures`.
 */
export async function wipeHubWebOrigin(deps: WipeHubWebOriginDeps): Promise<WipeResult> {
  let failures = 0;
  for (const storage of [deps.local, deps.session]) {
    try {
      storage.clear();
    } catch {
      failures++;
    }
  }
  const names = new Set(deps.knownDatabases);
  if (deps.idb?.databases) {
    try {
      for (const db of await deps.idb.databases()) if (db.name) names.add(db.name);
    } catch {
      // fall back to the known names
    }
  }
  const idb = deps.idb;
  if (idb) {
    await Promise.all(
      [...names].map(async (name) => {
        try {
          await idb.deleteDatabase(name);
        } catch {
          failures++;
        }
      }),
    );
  }
  return { databases: [...names], failures };
}
