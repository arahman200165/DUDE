/**
 * Generic Promise-wrapped native IndexedDB helpers — no library, per the dependency-minimal
 * convention (this codebase had zero prior IndexedDB usage before Milestone 295). Shared by
 * `core/history/history-db.ts`; a distinct database from Workspace's own small localStorage-backed
 * stores, which turned out not to need IndexedDB at all (see `core/workspace/AGENTS.md`).
 */
export function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function promisifyTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function openDatabase(
  name: string,
  version: number,
  onUpgrade: (db: IDBDatabase, oldVersion: number) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = (event) => onUpgrade(request.result, event.oldVersion);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Walks a cursor front-to-back (or back-to-front) collecting up to `limit` mapped values. */
export function collectFromCursor<T, R>(
  request: IDBRequest<IDBCursorWithValue | null>,
  limit: number,
  map: (value: T) => R | undefined,
): Promise<R[]> {
  return new Promise((resolve, reject) => {
    const results: R[] = [];
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || results.length >= limit) {
        resolve(results);
        return;
      }
      const mapped = map(cursor.value as T);
      if (mapped !== undefined) results.push(mapped);
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
}

/** Deletes up to `limit` records a cursor walks over; resolves with how many were actually deleted. */
export function deleteFromCursor(request: IDBRequest<IDBCursorWithValue | null>, limit = Infinity): Promise<number> {
  return new Promise((resolve, reject) => {
    let deleted = 0;
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || deleted >= limit) {
        resolve(deleted);
        return;
      }
      cursor.delete();
      deleted++;
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
}
