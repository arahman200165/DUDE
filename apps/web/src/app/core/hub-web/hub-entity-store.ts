import { signal } from '@angular/core';
import type { SyncRecord } from '@dude/contracts/hub';
import type { EntityCodec } from '@dude/persistence';
import type { CollectionOptions, EntityCollection, EntityWriteResult } from '../persistence/entities/entity-store';
import type { HubCommit, HubCommitResult, HubWebEngine } from './hub-web-engine';

export type HubEntityEngine = Pick<HubWebEngine, 'commit' | 'commitMany'>;

export interface HubEntityCollectionConfig<T, C = void> {
  readonly codec: EntityCodec<T, C>;
  readonly options?: CollectionOptions<T, C> | undefined;
  readonly engine: HubEntityEngine;
  /** Snapshot records of every type; this collection reads its own. */
  readonly records: readonly SyncRecord[];
}

const failure = (error: string): EntityWriteResult => ({ ok: false, error });
const OK: EntityWriteResult = { ok: true };
const CHUNK = 100;

/**
 * Hub web: items are seeded from the boot snapshot and every mutation updates the signal at once, then commits to the
 * Hub through the engine, rolling that record back if the Hub refuses it (unreachable, rejected). A revision conflict is
 * settled by the engine (merge, or the owner's choice in the conflict dialog) and its outcome is adopted here.
 */
export function createHubEntityCollection<T, C = void>(config: HubEntityCollectionConfig<T, C>): EntityCollection<T> {
  const { codec, engine } = config;
  const compare = config.options?.compare;
  const context = config.options?.context as C;
  const idOf = (value: T): string => codec.idOf(value);
  const sorted = (values: T[]): T[] => (compare ? values.sort(compare) : values);
  const decode = (payload: unknown): T | null => {
    const value = codec.decode(payload, context);
    return value === null || value === undefined ? null : value;
  };

  const seeded: T[] = [];
  for (const record of config.records) {
    if (record.entityType !== codec.entityType || record.deleted) continue;
    const value = decode(record.payload);
    if (value !== null) seeded.push(value);
  }
  const items = signal<readonly T[]>(sorted(seeded));

  let chain: Promise<unknown> = Promise.resolve();
  // Serialises commits so the Hub sees them in the order the user made them.
  const enqueue = <R>(task: () => Promise<R>): Promise<R> => {
    const run = chain.then(task, task);
    chain = run.catch(() => undefined);
    return run;
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
  const quiet = codec.entityType === 'usage';
  const commitOf = (id: string, payload: unknown): HubCommit => ({ entityType: codec.entityType, entityId: id, schemaVersion: codec.schemaVersion, payload, quiet });

  const put = (value: T): void => items.update((current) => sorted([...current.filter((existing) => idOf(existing) !== idOf(value)), value]));
  const drop = (id: string): void => items.update((current) => current.filter((existing) => idOf(existing) !== id));
  const restore = (id: string, previous: T | undefined): void => (previous === undefined ? drop(id) : put(previous));

  /** Brings the signal in line with what the engine decided for `id`. Returns false when the write failed (caller rolls back). */
  const settle = (id: string, previous: T | undefined, result: HubCommitResult): EntityWriteResult => {
    if (!result.ok) {
      restore(id, previous);
      console.error(`[entity-store] ${codec.entityType} write failed: ${result.error}`);
      return failure(result.error);
    }
    if (result.outcome === 'applied') return OK;
    if (result.outcome === 'merged' || result.outcome === 'hub') {
      const value = result.payload === null ? null : decode(result.payload);
      if (value === null) drop(id);
      else put(value);
      return OK;
    }
    const hubValue = result.payload === null ? null : decode(result.payload);
    if (hubValue === null) drop(id);
    else put(hubValue);
    const copy = decode(result.fork.payload);
    if (copy !== null) put(copy);
    return OK;
  };

  return {
    items,
    get: find,
    async upsert(value) {
      const id = idOf(value);
      const previous = find(id);
      put(value);
      return track([id], () => enqueue(async () => settle(id, previous, await engine.commit(commitOf(id, codec.encode(value))))));
    },
    async remove(id) {
      const previous = find(id);
      if (previous === undefined) return OK;
      drop(id);
      return track([id], () => enqueue(async () => settle(id, previous, await engine.commit(commitOf(id, null)))));
    },
    async importMany(values) {
      if (values.length === 0) return OK;
      const incoming = new Map(values.map((value) => [idOf(value), value] as const));
      const previous = new Map([...incoming.keys()].map((id) => [id, find(id)] as const));
      for (const value of incoming.values()) put(value);
      return track([...incoming.keys()], () =>
        enqueue(async () => {
          const ids = [...incoming.keys()];
          let firstError: string | null = null;
          for (let i = 0; i < ids.length; i += CHUNK) {
            const chunk = ids.slice(i, i + CHUNK);
            const results = await engine.commitMany(chunk.map((id) => commitOf(id, codec.encode(incoming.get(id) as T))));
            chunk.forEach((id, j) => {
              const outcome = settle(id, previous.get(id), results[j] as HubCommitResult);
              if (!outcome.ok && firstError === null) firstError = outcome.error;
            });
          }
          return firstError === null ? OK : failure(firstError);
        }),
      );
    },
    applyRemote(upserts, deletes) {
      const decoded = new Map<string, T>();
      for (const { entityId, payload } of upserts) {
        if (inflight.has(entityId)) continue;
        const value = decode(payload);
        if (value !== null) decoded.set(entityId, value);
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
