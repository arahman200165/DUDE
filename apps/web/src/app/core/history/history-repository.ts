import { InjectionToken, inject } from '@angular/core';
import { MAX_ENTRIES_PER_TOOL, MAX_ENTRY_AGE_MS, MAX_ENTRY_SIZE_BYTES, MAX_TOTAL_ENTRIES, type HistoryEntry } from '@dude/domain/core/history/history.model';
import { historyEntryCodec, type HistoryAddResult, type HistoryRecord, type HistoryRepository, type HistoryRetention } from '@dude/persistence';
import type { PlatformBridge } from '@dude/contracts/shared/models/platform-bridge.model';
import { currentPlatformBridge } from '../platform/platform-bridge.adapter';
import { BOOT_SNAPSHOT, type BootSnapshot } from '../persistence/device-store/boot-snapshot';
import { runLegacyIndexedDbImport } from '../storage/legacy-indexeddb-import';
import {
  clearAllEntries, countAll, countByTool, deleteAllByTool, deleteEntry, deleteOldestByTool, deleteOldestOverall, deleteOlderThan, getEntry, listByTool, listRecent, putEntry,
} from './history-db';

export const HISTORY_DB_NAME = 'dude:v1:history';
export const HISTORY_IMPORT_NAMESPACE = '__history-import__';

export const WEB_HISTORY_RETENTION: HistoryRetention = {
  maxPerTool: MAX_ENTRIES_PER_TOOL,
  maxTotal: MAX_TOTAL_ENTRIES,
  maxAgeMs: MAX_ENTRY_AGE_MS,
  maxEntryBytes: MAX_ENTRY_SIZE_BYTES,
};

/** Where this renderer's history lives: the desktop Device Store, or this browser's IndexedDB. */
export type RendererHistoryRepository = HistoryRepository & { readonly kind: 'device' | 'indexeddb' };

const encoder = new TextEncoder();
export const jsonByteLength = (value: unknown): number => encoder.encode(JSON.stringify(value)).length;

/** A record carries the whole entry as its payload; `sizeBytes` is the entry's JSON byte length. */
export function entryToRecord(entry: HistoryEntry): HistoryRecord {
  return { id: entry.id, toolId: entry.toolId, createdAt: Date.parse(entry.createdAt) || 0, sizeBytes: jsonByteLength(entry), payload: entry };
}

/** Undefined when the payload is not a recognizable entry (corrupt or from a newer schema). */
export function recordToEntry(record: HistoryRecord): HistoryEntry | undefined {
  return historyEntryCodec.decode(record.payload) ?? undefined;
}

/** The IndexedDB row for a record: the payload when it is a valid entry, otherwise a minimal one built from the record. */
function toStoredEntry(record: HistoryRecord): HistoryEntry {
  const base: HistoryEntry = historyEntryCodec.decode(record.payload)
    ?? { id: record.id, schemaVersion: 1, toolId: record.toolId, createdAt: '', summary: '', state: {} };
  return { ...base, id: record.id, toolId: record.toolId, createdAt: new Date(record.createdAt).toISOString() };
}

const fromStored = (entry: HistoryEntry): HistoryRecord => entryToRecord(entry);

/** Web adapter over `history-db.ts`; enforces the same caps the service used to enforce after each write. */
export class IndexedDbHistoryRepository implements RendererHistoryRepository {
  readonly kind = 'indexeddb';

  constructor(private readonly retention: HistoryRetention = WEB_HISTORY_RETENTION, private readonly now: () => number = Date.now) {}

  async add(record: HistoryRecord): Promise<HistoryAddResult> {
    if (record.sizeBytes > this.retention.maxEntryBytes) return { ok: false, error: 'too-large' };
    const entry = toStoredEntry(record);
    try {
      await putEntry(entry);
    } catch (error) {
      // Quota: drop the oldest tenth and try once more before giving up.
      const total = await countAll().catch(() => 0);
      await deleteOldestOverall(Math.max(1, Math.floor(total * 0.1))).catch(() => undefined);
      try { await putEntry(entry); } catch { throw error; }
    }
    const before = await countAll();
    await this.enforceRetention(record.toolId);
    return { ok: true, evicted: Math.max(0, before - (await countAll())) };
  }

  async listByTool(toolId: string): Promise<HistoryRecord[]> {
    return (await listByTool(toolId, this.retention.maxTotal)).map(fromStored);
  }

  async listRecent(limit: number): Promise<HistoryRecord[]> {
    return (await listRecent(limit)).map(fromStored);
  }

  async get(id: string): Promise<HistoryRecord | undefined> {
    const entry = await getEntry(id);
    return entry ? fromStored(entry) : undefined;
  }

  remove(id: string): Promise<void> { return deleteEntry(id); }
  clear(): Promise<void> { return clearAllEntries(); }
  clearTool(toolId: string): Promise<void> { return deleteAllByTool(toolId); }

  private async enforceRetention(toolId: string): Promise<void> {
    const { maxPerTool, maxTotal, maxAgeMs } = this.retention;
    await deleteOlderThan(new Date(this.now() - maxAgeMs).toISOString());
    const perTool = await countByTool(toolId);
    if (perTool > maxPerTool) await deleteOldestByTool(toolId, perTool - maxPerTool);
    const total = await countAll();
    if (total > maxTotal) await deleteOldestOverall(total - maxTotal);
  }
}

/** Desktop adapter: main forwards each call to the Device Store, which enforces retention in the add transaction. */
export class DeviceHistoryRepository implements RendererHistoryRepository {
  readonly kind = 'device';

  constructor(private readonly store: PlatformBridge['store']['history']) {}

  async add(record: HistoryRecord): Promise<HistoryAddResult> {
    const result = await this.store.add(record);
    if (result.ok) return result;
    if (result.error === 'too-large') return { ok: false, error: 'too-large' };
    throw new Error(result.error);
  }

  async listByTool(toolId: string): Promise<HistoryRecord[]> { return [...(await this.store.list({ toolId }))]; }
  async listRecent(limit: number): Promise<HistoryRecord[]> { return [...(await this.store.list({ limit: Math.min(5000, Math.max(1, Math.floor(limit))) }))]; }
  async get(id: string): Promise<HistoryRecord | undefined> { return (await this.store.get(id)) ?? undefined; }
  async remove(id: string): Promise<void> { this.check(await this.store.remove(id)); }
  async clear(): Promise<void> { this.check(await this.store.clear()); }
  async clearTool(toolId: string): Promise<void> { this.check(await this.store.clearTool(toolId)); }

  private check(result: { readonly ok: boolean; readonly error?: string }): void {
    if (!result.ok) throw new Error(result.error ?? 'The device store request failed.');
  }
}

export function createHistoryRepository(bridge: PlatformBridge | undefined, snapshot: BootSnapshot): RendererHistoryRepository {
  if (bridge?.store?.history && snapshot.boot?.status === 'ready' && !snapshot.degradedReason) return new DeviceHistoryRepository(bridge.store.history);
  return new IndexedDbHistoryRepository();
}

export const HISTORY_REPOSITORY = new InjectionToken<RendererHistoryRepository>('DUDE history repository', {
  providedIn: 'root',
  factory: () => createHistoryRepository(currentPlatformBridge(), inject(BOOT_SNAPSHOT)),
});

/**
 * Moves the old per-origin IndexedDB history into the device repository, oldest first (so retention keeps
 * the newest), then deletes that database. Never throws; a failure leaves the marker unset for the next launch.
 */
export async function importLegacyHistory(repo: RendererHistoryRepository, bridge: PlatformBridge | undefined, snapshot: BootSnapshot): Promise<void> {
  if (repo.kind !== 'device' || !bridge?.store) return;
  try {
    await runLegacyIndexedDbImport({
      dbName: HISTORY_DB_NAME,
      storeName: 'entries',
      markerNamespace: HISTORY_IMPORT_NAMESPACE,
      snapshot,
      bridge: bridge.store,
      importRows: async (rows) => {
        const entries = rows.map((row) => historyEntryCodec.decode(row)).filter((entry): entry is HistoryEntry => entry !== null);
        entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        for (const entry of entries) await repo.add(entryToRecord(entry));
      },
    });
  } catch (error) {
    console.warn('[history] legacy import failed; it will be retried next launch', error);
  }
}
