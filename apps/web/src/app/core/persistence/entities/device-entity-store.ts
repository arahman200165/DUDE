import { signal } from '@angular/core';
import type { DeviceStoreBoot, EntityCommit } from '@dude/contracts';
import type { PlatformBridge } from '@dude/contracts/shared/models/platform-bridge.model';
import type { EntityCodec } from '@dude/persistence';
import { activeLocalBackend } from '../local-backend-registry';
import { finishLegacyImport, isEntityImportDone, readLegacyItems } from './entity-legacy-import';
import type { CollectionOptions, EntityCollection, EntityWriteResult, LegacyBlob } from './entity-store';
import type { OutboxStatusService } from './outbox-status.service';

export const IMPORT_CHUNK = 1000;

export type DeviceEntityBridge = Pick<PlatformBridge['store'], 'commitEntity' | 'importEntities'>;

export interface DeviceEntityCollectionConfig<T, C = void> {
  readonly codec: EntityCodec<T, C>;
  readonly legacy: LegacyBlob<T>;
  readonly options?: CollectionOptions<T, C> | undefined;
  readonly boot: Pick<DeviceStoreBoot, 'records'> | null;
  readonly bridge: DeviceEntityBridge;
  /** False for a degraded store: the collection works in memory and nothing is saved. */
  readonly persist: boolean;
  readonly outbox?: Pick<OutboxStatusService, 'noteCommit'>;
}

const failure = (error: string): EntityWriteResult => ({ ok: false, error });
const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const okResult = (backpressure: boolean | undefined): EntityWriteResult => (backpressure === undefined ? { ok: true } : { ok: true, backpressure });

type ImportResult = Awaited<ReturnType<DeviceEntityBridge['importEntities']>>;

/**
 * Desktop: items come from the boot snapshot (decoded by the codec); every mutation updates the signal
 * at once and then commits to the Device Store, rolling that record back if the commit fails. A one-shot
 * import converts a pre-31B blob (already hydrated into the kv) when the store holds no records of the type.
 */
export function createDeviceEntityCollection<T, C = void>(config: DeviceEntityCollectionConfig<T, C>): EntityCollection<T> {
  const { codec, legacy, bridge, persist, outbox } = config;
  const compare = config.options?.compare;
  const idOf = (value: T): string => codec.idOf(value);
  const sorted = (values: T[]): T[] => (compare ? values.sort(compare) : values);
  const legacyUntyped = legacy as LegacyBlob<unknown>;

  const stored: T[] = [];
  for (const record of config.boot?.records ?? []) {
    if (record.entityType !== codec.entityType) continue;
    const value = codec.decode(record.payload, config.options?.context as C);
    if (value !== null && value !== undefined) stored.push(value);
  }

  const kv = activeLocalBackend();
  let legacyItems: T[] = [];
  if (persist && !isEntityImportDone(kv, codec.entityType)) {
    if (stored.length === 0) legacyItems = readLegacyItems(kv, codec, legacy, config.options?.context);
    else finishLegacyImport(kv, codec.entityType, legacyUntyped);
  }

  const items = signal<readonly T[]>(sorted(stored.length > 0 ? stored : legacyItems));
  let chain: Promise<unknown> = Promise.resolve();
  // Serialises commits so the store sees them in the order the user made them.
  const enqueue = <R>(task: () => Promise<R>): Promise<R> => {
    const run = chain.then(task, task);
    chain = run.catch(() => undefined);
    return run;
  };

  const toCommit = (value: T): EntityCommit => ({ entityType: codec.entityType, entityId: idOf(value), op: 'upsert', payload: codec.encode(value) });

  const importChunk = (commits: EntityCommit[]): Promise<ImportResult> =>
    enqueue(() => bridge.importEntities(commits).catch((error: unknown): ImportResult => ({ ok: false, error: errorText(error) })));

  const commitOne = async (commit: EntityCommit): Promise<EntityWriteResult> => {
    try {
      const result = await bridge.commitEntity(commit);
      if (!result.ok) {
        outbox?.noteCommit();
        return failure(result.error);
      }
      outbox?.noteCommit(result.backpressure);
      return okResult(result.backpressure);
    } catch (error) {
      return failure(errorText(error));
    }
  };

  const restore = (id: string, previous: T | undefined): void => {
    items.update((current) => {
      const without = current.filter((value) => idOf(value) !== id);
      return previous === undefined ? without : sorted([...without, previous]);
    });
  };

  const report = (what: string, result: EntityWriteResult): EntityWriteResult => {
    if (!result.ok) console.error(`[entity-store] ${what} failed: ${result.error}`);
    return result;
  };

  // Ids with a local write queued or running; a remote change for them must not clobber the optimistic value.
  const inflight = new Map<string, number>();
  const track = async <R>(ids: readonly string[], task: () => Promise<R>): Promise<R> => {
    for (const id of ids) inflight.set(id, (inflight.get(id) ?? 0) + 1);
    try {
      return await task();
    } finally {
      for (const id of ids) {
        const left = (inflight.get(id) ?? 1) - 1;
        if (left <= 0) inflight.delete(id);
        else inflight.set(id, left);
      }
    }
  };

  const find = (id: string): T | undefined => items().find((value) => idOf(value) === id);

  if (persist && legacyItems.length > 0) {
    void (async () => {
      let ok = true;
      for (let i = 0; i < legacyItems.length && ok; i += IMPORT_CHUNK) {
        const result = await importChunk(legacyItems.slice(i, i + IMPORT_CHUNK).map(toCommit));
        if (!result.ok) {
          ok = false;
          console.error(`[entity-store] legacy import of ${codec.entityType} failed; will retry next launch: ${result.error}`);
        } else outbox?.noteCommit(result.backpressure);
      }
      if (ok) finishLegacyImport(kv, codec.entityType, legacyUntyped);
    })();
  }

  return {
    items,
    get: find,
    async upsert(value) {
      const id = idOf(value);
      const previous = find(id);
      items.update((current) => sorted([...current.filter((existing) => idOf(existing) !== id), value]));
      if (!persist) return { ok: true };
      const result = await track([id], () => enqueue(() => commitOne(toCommit(value))));
      if (!result.ok) restore(id, previous);
      return report(`upsert ${codec.entityType}`, result);
    },
    async remove(id) {
      const previous = find(id);
      if (previous === undefined) return { ok: true };
      items.update((current) => current.filter((existing) => idOf(existing) !== id));
      if (!persist) return { ok: true };
      const result = await track([id], () => enqueue(() => commitOne({ entityType: codec.entityType, entityId: id, op: 'delete' })));
      if (!result.ok) restore(id, previous);
      return report(`remove ${codec.entityType}`, result);
    },
    async importMany(values) {
      if (values.length === 0) return { ok: true };
      const previous = new Map(items().map((value) => [idOf(value), value] as const));
      const incoming = new Map(values.map((value) => [idOf(value), value] as const));
      items.update((current) => sorted([...current.filter((existing) => !incoming.has(idOf(existing))), ...incoming.values()]));
      if (!persist) return { ok: true };
      const commits = [...incoming.values()].map(toCommit);
      return track([...incoming.keys()], async () => {
      let backpressure: boolean | undefined;
      for (let i = 0; i < commits.length; i += IMPORT_CHUNK) {
        const result = await importChunk(commits.slice(i, i + IMPORT_CHUNK));
        if (!result.ok) {
          // Chunks committed before this one stay saved; the signal goes back to what the store holds.
          const committed = new Set(commits.slice(0, i).map((commit) => commit.entityId));
          items.update((current) => {
            const kept = current.filter((existing) => !incoming.has(idOf(existing)) || committed.has(idOf(existing)));
            const restored = [...previous.entries()].filter(([id]) => incoming.has(id) && !committed.has(id)).map(([, value]) => value);
            return sorted([...kept, ...restored]);
          });
          outbox?.noteCommit();
          return report(`import ${codec.entityType}`, failure(result.error));
        }
        backpressure = backpressure || result.backpressure;
      }
      outbox?.noteCommit(backpressure);
      return okResult(backpressure);
      });
    },
    applyRemote(upserts, deletes) {
      const decoded = new Map<string, T>();
      for (const { entityId, payload } of upserts) {
        if (inflight.has(entityId)) continue;
        const value = codec.decode(payload, config.options?.context as C);
        if (value !== null && value !== undefined) decoded.set(entityId, value);
      }
      const removed = new Set(deletes.filter((id) => !inflight.has(id)));
      if (decoded.size === 0 && removed.size === 0) return;
      items.update((current) => {
        const kept = current.filter((existing) => !removed.has(idOf(existing)) && !decoded.has(idOf(existing)));
        return sorted([...kept, ...decoded.values()]);
      });
    },
  };
}
