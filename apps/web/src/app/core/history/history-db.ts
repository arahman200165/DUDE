import { collectFromCursor, deleteFromCursor, openDatabase, promisifyRequest, promisifyTransaction } from '../storage/indexed-db';
import { HistoryEntry, migrateHistoryEntry } from "@dude/domain/core/history/history.model";

const DB_NAME = 'dude:v1:history';
const DB_VERSION = 1;
const STORE = 'entries';

function upgrade(db: IDBDatabase): void {
  const store = db.createObjectStore(STORE, { keyPath: 'id' });
  store.createIndex('by-toolId', 'toolId', { unique: false });
  store.createIndex('by-createdAt', 'createdAt', { unique: false });
  // Compound index: "this tool's entries, newest first" without a full-store scan.
  store.createIndex('by-toolId-createdAt', ['toolId', 'createdAt'], { unique: false });
}

let dbPromise: Promise<IDBDatabase> | null = null;
function getDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    // `typeof` never throws, even for a genuinely undeclared global — unlike referencing
    // `indexedDB` directly, which every real browser declares but a plain jsdom test environment
    // doesn't. Every real call site below awaits `getDb()` inside its own try/catch regardless;
    // this just avoids a raw ReferenceError surfacing as a top-level unhandled rejection.
    dbPromise =
      typeof indexedDB === 'undefined'
        ? Promise.reject(new Error('IndexedDB is not available in this environment.'))
        : openDatabase(DB_NAME, DB_VERSION, upgrade);
    // Never cache a failure permanently — a transient failure (or, in tests, a polyfill that
    // loads after this module was first evaluated) should be retried on the next call, not
    // poison every future call for the lifetime of the page.
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

function toolRange(toolId: string): IDBKeyRange {
  return IDBKeyRange.bound([toolId, ''], [toolId, '￿']);
}

export async function putEntry(entry: HistoryEntry): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(entry);
  await promisifyTransaction(tx);
}

export async function getEntry(id: string): Promise<HistoryEntry | undefined> {
  const db = await getDb();
  const tx = db.transaction(STORE, 'readonly');
  const raw = await promisifyRequest(tx.objectStore(STORE).get(id));
  return raw ? migrateHistoryEntry(raw) : undefined;
}

export async function deleteEntry(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).delete(id);
  await promisifyTransaction(tx);
}

export async function listRecent(limit: number): Promise<HistoryEntry[]> {
  const db = await getDb();
  const tx = db.transaction(STORE, 'readonly');
  const request = tx.objectStore(STORE).index('by-createdAt').openCursor(null, 'prev');
  return collectFromCursor<HistoryEntry, HistoryEntry>(request, limit, migrateHistoryEntry);
}

export async function listByTool(toolId: string, limit: number): Promise<HistoryEntry[]> {
  const db = await getDb();
  const tx = db.transaction(STORE, 'readonly');
  const request = tx.objectStore(STORE).index('by-toolId-createdAt').openCursor(toolRange(toolId), 'prev');
  return collectFromCursor<HistoryEntry, HistoryEntry>(request, limit, migrateHistoryEntry);
}

export async function countByTool(toolId: string): Promise<number> {
  const db = await getDb();
  const tx = db.transaction(STORE, 'readonly');
  return promisifyRequest(tx.objectStore(STORE).index('by-toolId').count(IDBKeyRange.only(toolId)));
}

export async function countAll(): Promise<number> {
  const db = await getDb();
  const tx = db.transaction(STORE, 'readonly');
  return promisifyRequest(tx.objectStore(STORE).count());
}

export async function deleteOldestByTool(toolId: string, count: number): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(STORE, 'readwrite');
  const request = tx.objectStore(STORE).index('by-toolId-createdAt').openCursor(toolRange(toolId), 'next');
  await deleteFromCursor(request, count);
  await promisifyTransaction(tx);
}

export async function deleteOldestOverall(count: number): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(STORE, 'readwrite');
  const request = tx.objectStore(STORE).index('by-createdAt').openCursor(null, 'next');
  await deleteFromCursor(request, count);
  await promisifyTransaction(tx);
}

export async function deleteOlderThan(cutoffIso: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(STORE, 'readwrite');
  const request = tx.objectStore(STORE).index('by-createdAt').openCursor(IDBKeyRange.upperBound(cutoffIso));
  await deleteFromCursor(request);
  await promisifyTransaction(tx);
}

export async function deleteAllByTool(toolId: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(STORE, 'readwrite');
  const request = tx.objectStore(STORE).index('by-toolId-createdAt').openCursor(toolRange(toolId));
  await deleteFromCursor(request);
  await promisifyTransaction(tx);
}

export async function clearAllEntries(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).clear();
  await promisifyTransaction(tx);
}
