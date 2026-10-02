import { InjectionToken, inject } from '@angular/core';
import type { NetworkRunAddResult, NetworkRunRecord, NetworkRunRepository, NetworkRunRetention } from '@dude/persistence';
import type { PlatformBridge } from '@dude/contracts/shared/models/platform-bridge.model';
import { BOOT_SNAPSHOT, type BootSnapshot } from '../persistence/device-store/boot-snapshot';
import { openDatabase, promisifyRequest, promisifyTransaction } from '../storage/indexed-db';
import { runLegacyIndexedDbImport } from '../storage/legacy-indexeddb-import';
import { currentPlatformBridge } from './platform-bridge.adapter';
import type { NetworkRun } from './network-diagnostics.service';

export const NETWORK_HISTORY_DB_NAME = 'dude:v1:network-history';
export const NETWORK_HISTORY_IMPORT_NAMESPACE = '__network-history-import__';
const STORE = 'runs';

export const WEB_NETWORK_RUN_RETENTION: NetworkRunRetention = {
  maxRuns: 100,
  maxAgeMs: 30 * 24 * 60 * 60 * 1000,
  maxTotalBytes: 50_000_000,
};

export type RendererNetworkRunRepository = NetworkRunRepository & { readonly kind: 'device' | 'indexeddb' };

const encoder = new TextEncoder();
const byteLength = (value: unknown): number => encoder.encode(JSON.stringify(value)).length;

/** The record carries the (already scrubbed) run as its payload. */
export function runToRecord(run: NetworkRun): NetworkRunRecord {
  return { id: run.id, createdAt: Date.parse(run.createdAt) || 0, sizeBytes: byteLength(run), payload: run };
}

export function recordToRun(record: NetworkRunRecord): NetworkRun | undefined {
  const payload = record.payload as Partial<NetworkRun> | null;
  return payload && typeof payload === 'object' && typeof payload.id === 'string' && typeof payload.createdAt === 'string' && payload.request
    ? (payload as NetworkRun)
    : undefined;
}

/**
 * A stored row. Rows written before M625 are the bare run (no `payload`); newer rows wrap the payload
 * with its byte size so the byte cap needs no re-serialization.
 */
interface Row { id: string; createdAt: string; sizeBytes?: number; payload?: unknown }

function toRow(record: NetworkRunRecord): Row {
  return { id: record.id, createdAt: new Date(record.createdAt).toISOString(), sizeBytes: record.sizeBytes, payload: record.payload };
}

function fromRow(row: Row): NetworkRunRecord {
  const createdAt = Date.parse(row.createdAt) || 0;
  if ('payload' in row && typeof row.sizeBytes === 'number') return { id: row.id, createdAt, sizeBytes: row.sizeBytes, payload: row.payload };
  return { id: row.id, createdAt, sizeBytes: byteLength(row), payload: row };
}

/** Web adapter over the raw `dude:v1:network-history` database; enforces the run/age/byte caps itself. */
export class IndexedDbNetworkRunRepository implements RendererNetworkRunRepository {
  readonly kind = 'indexeddb';

  constructor(private readonly retention: NetworkRunRetention = WEB_NETWORK_RUN_RETENTION, private readonly now: () => number = Date.now) {}

  async add(run: NetworkRunRecord): Promise<NetworkRunAddResult> {
    if (run.sizeBytes > this.retention.maxTotalBytes) return { ok: false, error: 'too-large' };
    return this.withDb(async (db) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(toRow(run));
      await promisifyTransaction(tx);
      const { evicted } = await this.prune(db);
      return { ok: true as const, evicted };
    });
  }

  async list(): Promise<NetworkRunRecord[]> {
    return this.withDb(async (db) => (await this.prune(db)).kept);
  }

  async get(id: string): Promise<NetworkRunRecord | undefined> {
    return this.withDb(async (db) => {
      const row = await promisifyRequest(db.transaction(STORE, 'readonly').objectStore(STORE).get(id) as IDBRequest<Row | undefined>);
      return row ? fromRow(row) : undefined;
    });
  }

  async remove(id: string): Promise<void> {
    await this.withDb(async (db) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      await promisifyTransaction(tx);
    });
  }

  async clear(): Promise<void> {
    await this.withDb(async (db) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      await promisifyTransaction(tx);
    });
  }

  private async withDb<T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T> {
    const db = await openDatabase(NETWORK_HISTORY_DB_NAME, 1, (created) => { created.createObjectStore(STORE, { keyPath: 'id' }); });
    try {
      return await fn(db);
    } finally {
      db.close();
    }
  }

  /** Newest first; drops runs past the age, count or byte cap and returns the survivors. */
  private async prune(db: IDBDatabase): Promise<{ kept: NetworkRunRecord[]; evicted: number }> {
    const rows = (await promisifyRequest(db.transaction(STORE, 'readonly').objectStore(STORE).getAll())) as Row[];
    const sorted = rows.map(fromRow).sort((a, b) => b.createdAt - a.createdAt);
    const cutoff = this.now() - this.retention.maxAgeMs;
    const kept: NetworkRunRecord[] = [];
    const doomed: string[] = [];
    let bytes = 0;
    for (const record of sorted) {
      if (record.createdAt < cutoff || kept.length >= this.retention.maxRuns || bytes + record.sizeBytes > this.retention.maxTotalBytes) {
        doomed.push(record.id);
      } else {
        kept.push(record);
        bytes += record.sizeBytes;
      }
    }
    if (doomed.length > 0) {
      const tx = db.transaction(STORE, 'readwrite');
      for (const id of doomed) tx.objectStore(STORE).delete(id);
      await promisifyTransaction(tx);
    }
    return { kept, evicted: doomed.length };
  }
}

/** Desktop adapter: main forwards each call to the Device Store, which enforces retention in the add transaction. */
export class DeviceNetworkRunRepository implements RendererNetworkRunRepository {
  readonly kind = 'device';

  constructor(private readonly store: PlatformBridge['store']['network']) {}

  async add(run: NetworkRunRecord): Promise<NetworkRunAddResult> {
    const result = await this.store.add(run);
    if (result.ok) return result;
    if (result.error === 'too-large') return { ok: false, error: 'too-large' };
    throw new Error(result.error);
  }

  async list(): Promise<NetworkRunRecord[]> { return [...(await this.store.list())]; }
  async get(id: string): Promise<NetworkRunRecord | undefined> { return (await this.store.get(id)) ?? undefined; }
  async remove(id: string): Promise<void> { this.check(await this.store.remove(id)); }
  async clear(): Promise<void> { this.check(await this.store.clear()); }

  private check(result: { readonly ok: boolean; readonly error?: string }): void {
    if (!result.ok) throw new Error(result.error ?? 'The device store request failed.');
  }
}

export function createNetworkRunRepository(bridge: PlatformBridge | undefined, snapshot: BootSnapshot): RendererNetworkRunRepository {
  if (bridge?.store?.network && snapshot.boot?.status === 'ready' && !snapshot.degradedReason) return new DeviceNetworkRunRepository(bridge.store.network);
  return new IndexedDbNetworkRunRepository();
}

export const NETWORK_RUN_REPOSITORY = new InjectionToken<RendererNetworkRunRepository>('DUDE network run repository', {
  providedIn: 'root',
  factory: () => createNetworkRunRepository(currentPlatformBridge(), inject(BOOT_SNAPSHOT)),
});

/** See `importLegacyHistory`: same one-shot, idempotent, never-throwing move for saved network runs. */
export async function importLegacyNetworkRuns(repo: RendererNetworkRunRepository, bridge: PlatformBridge | undefined, snapshot: BootSnapshot): Promise<void> {
  if (repo.kind !== 'device' || !bridge?.store) return;
  try {
    await runLegacyIndexedDbImport({
      dbName: NETWORK_HISTORY_DB_NAME,
      storeName: STORE,
      markerNamespace: NETWORK_HISTORY_IMPORT_NAMESPACE,
      snapshot,
      bridge: bridge.store,
      importRows: async (rows) => {
        const runs = rows.map((row) => fromRow(row as Row)).sort((a, b) => a.createdAt - b.createdAt);
        for (const record of runs) await repo.add(record);
      },
    });
  } catch (error) {
    console.warn('[network-history] legacy import failed; it will be retried next launch', error);
  }
}
