import { Injectable, signal } from '@angular/core';
import type { NetworkRun } from './network-diagnostics.service';

const DB_NAME = 'dude:v1:network-history';
const STORE = 'runs';
const MAX_RUNS = 100;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_BYTES = 50_000_000;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore(STORE, { keyPath: 'id' }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
function all(db: IDBDatabase): Promise<NetworkRun[]> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result as NetworkRun[]);
    request.onerror = () => reject(request.error);
  });
}
function scrub(run: NetworkRun): NetworkRun {
  const { headers: _headers, body: _body, ...request } = run.request;
  const result = run.result && typeof run.result === 'object' ? { ...run.result as Record<string, unknown> } : run.result;
  if (result && typeof result === 'object') delete (result as Record<string, unknown>)['bodyBase64'];
  if (result && typeof result === 'object' && (result as Record<string, unknown>)['headers']) { const headers = { ...(result as Record<string, unknown>)['headers'] as Record<string, unknown> }; for (const name of Object.keys(headers)) if (['set-cookie', 'authorization', 'proxy-authorization'].includes(name.toLowerCase())) delete headers[name]; (result as Record<string, unknown>)['headers'] = headers; }
  return { ...run, request, result };
}

/** Only user-selected completed runs are stored; restoring never starts a job. */
@Injectable({ providedIn: 'root' })
export class NetworkRunHistoryService {
  readonly saved = signal<readonly NetworkRun[]>([]);
  readonly error = signal('');
  constructor() { if (typeof indexedDB !== 'undefined') void this.refresh(); }

  async refresh(): Promise<void> {
    try { const db = await openDb(); await this.prune(db); this.saved.set((await all(db)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))); db.close(); }
    catch (error) { this.error.set(error instanceof Error ? error.message : String(error)); }
  }
  async save(run: NetworkRun): Promise<void> {
    const safe = scrub(run);
    const bytes = new TextEncoder().encode(JSON.stringify(safe)).length;
    if (bytes > MAX_BYTES) { this.error.set('This result exceeds the 50 MB history limit.'); return; }
    try {
      const db = await openDb();
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(safe);
      await done(tx);
      await this.prune(db);
      db.close();
      await this.refresh();
    } catch (error) { this.error.set(error instanceof Error ? error.message : String(error)); }
  }
  async delete(id: string): Promise<void> {
    try { const db = await openDb(); const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(id); await done(tx); db.close(); await this.refresh(); }
    catch (error) { this.error.set(error instanceof Error ? error.message : String(error)); }
  }
  async clear(): Promise<void> {
    try { const db = await openDb(); const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).clear(); await done(tx); db.close(); this.saved.set([]); }
    catch (error) { this.error.set(error instanceof Error ? error.message : String(error)); }
  }
  private async prune(db: IDBDatabase): Promise<void> {
    const sorted = (await all(db)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    let bytes = 0;
    const remove: string[] = [];
    for (const [index, run] of sorted.entries()) {
      const size = new TextEncoder().encode(JSON.stringify(run)).length;
      if (index >= MAX_RUNS || Date.now() - Date.parse(run.createdAt) > MAX_AGE_MS || bytes + size > MAX_BYTES) remove.push(run.id);
      else bytes += size;
    }
    if (remove.length) { const tx = db.transaction(STORE, 'readwrite'); for (const id of remove) tx.objectStore(STORE).delete(id); await done(tx); }
  }
}
