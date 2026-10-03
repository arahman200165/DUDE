import type { SyncRecord } from '@dude/contracts/hub';
import { findKvBindingForEntity, kvSyncEntityOf, type KvSyncEntity } from '@dude/persistence';
import { settingPayload, settingValueOf, splitSettingId, SETTING_ENTITY, categoryOf } from '@dude/sync';
import type { StorageBackend, StorageWriteMeta } from '../persistence/storage-backend';
import { parseStorageKey, toStorageKey } from '../persistence/device-store/device-kv-backend';
import { HUB_WRITE_REFUSED } from './hub-web-connection.service';
import type { HubCommit, HubCommitResult, HubWebEngine } from './hub-web-engine';
import type { HubWebAccess } from './hub-web.types';

export type HubKvEngine = Pick<HubWebEngine, 'commitMany' | 'connection' | 'feedback'>;

export interface HubKvBackendOptions {
  readonly engine: HubKvEngine;
  readonly access: HubWebAccess;
  /** Snapshot records; `setting` records and the bound singletons seed the in-memory shared keys. */
  readonly records: readonly SyncRecord[];
  /** Everything that is not shared state: `window.localStorage`, origin-local and wiped at sign-out. */
  readonly local: StorageBackend;
  readonly debounceMs?: number;
}

export interface HubKvBackend extends StorageBackend {
  /** Resolves once every pending write has settled (never rejects). */
  flush(): Promise<void>;
  pendingCount(): number;
  /** Where a reverted or Hub-decided value is handed to the open signals (`PersistenceService.adoptRemote`). */
  setAdopter(adopt: (namespace: string, key: string, value: unknown) => void): void;
  dispose(): void;
}

interface Pending {
  readonly entity: KvSyncEntity;
  readonly namespace: string;
  readonly key: string;
  readonly version: number;
  /** The raw value before the first unsettled write; restored if the Hub refuses the change. */
  readonly previous: string | undefined;
}

const fromRaw = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

/**
 * `local` StorageBackend of the Hub-served web (PD-053). Shared keys (the ones the desktop store would journal, in a
 * category the owner left web access on for) live in memory, seeded from the Hub snapshot, and every write becomes
 * a Hub op after a short debounce. A write while the Hub cannot be reached is refused and reverted. Every other key
 * is plain browser storage.
 */
export function createHubKvBackend(options: HubKvBackendOptions): HubKvBackend {
  const { engine, access, local } = options;
  const debounceMs = options.debounceMs ?? 500;
  const shared = new Map<string, string>();
  const dirty = new Map<string, Pending>();
  let version = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<void> = Promise.resolve();
  let adopt: (namespace: string, key: string, value: unknown) => void = () => undefined;

  for (const record of options.records) {
    if (record.deleted || record.payload === null) continue;
    const category = categoryOf(record.entityType);
    if (!category || !access[category]) continue;
    if (record.entityType === SETTING_ENTITY) {
      const ref = splitSettingId(record.entityId);
      const value = settingValueOf(record.payload);
      if (ref && value !== undefined) shared.set(toStorageKey(ref.namespace, ref.key), JSON.stringify(value));
      continue;
    }
    const binding = findKvBindingForEntity(record.entityType, record.entityId);
    if (binding) shared.set(toStorageKey(binding.namespace, binding.key), JSON.stringify(record.payload));
  }

  const notifyRefusal = (): boolean => {
    const state = engine.connection.state();
    if (state === 'live') return false;
    engine.feedback.notify(HUB_WRITE_REFUSED[state]);
    return true;
  };

  const handBack = (fullKey: string, raw: string | undefined): void => {
    const parsed = parseStorageKey(fullKey);
    if (!parsed || raw === undefined) return;
    // Out of the caller's stack: this runs inside a signal effect that just wrote the key.
    queueMicrotask(() => adopt(parsed.namespace, parsed.key, fromRaw(raw)));
  };

  const setShared = (fullKey: string, raw: string | undefined): void => {
    if (raw === undefined) shared.delete(fullKey);
    else shared.set(fullKey, raw);
  };

  const apply = (fullKey: string, pending: Pending, result: HubCommitResult): void => {
    if (!result.ok) {
      setShared(fullKey, pending.previous);
      handBack(fullKey, pending.previous);
      return;
    }
    if (result.outcome === 'applied') return;
    const payload = result.payload;
    const value = payload === null ? undefined : pending.entity.wrapped ? settingValueOf(payload) : payload;
    const raw = value === undefined ? undefined : JSON.stringify(value);
    setShared(fullKey, raw);
    handBack(fullKey, raw);
  };

  const commitPending = async (): Promise<void> => {
    const entries = [...dirty.entries()];
    if (entries.length === 0) return;
    if (engine.connection.state() !== 'live') {
      notifyRefusal();
      for (const [fullKey, pending] of entries) {
        if (dirty.get(fullKey)?.version !== pending.version) continue;
        dirty.delete(fullKey);
        setShared(fullKey, pending.previous);
        handBack(fullKey, pending.previous);
      }
      return;
    }
    const commits: HubCommit[] = entries.map(([fullKey, pending]) => {
      const raw = shared.get(fullKey);
      const value = raw === undefined ? null : fromRaw(raw);
      return {
        entityType: pending.entity.entityType,
        entityId: pending.entity.entityId,
        schemaVersion: pending.entity.schemaVersion,
        payload: raw === undefined ? null : pending.entity.wrapped ? settingPayload(pending.namespace, pending.key, value) : value,
      };
    });
    const results = await engine.commitMany(commits);
    entries.forEach(([fullKey, pending], i) => {
      // A key rewritten while the commit was in flight has a newer version and stays dirty.
      if (dirty.get(fullKey)?.version !== pending.version) return;
      dirty.delete(fullKey);
      apply(fullKey, pending, results[i] as HubCommitResult);
    });
  };

  const flush = (): Promise<void> => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    chain = chain.then(commitPending, commitPending);
    return chain;
  };

  const schedule = (): void => {
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, debounceMs);
  };

  const mark = (fullKey: string, entity: KvSyncEntity, namespace: string, key: string): void => {
    const previous = dirty.get(fullKey)?.previous ?? shared.get(fullKey);
    dirty.set(fullKey, { entity, namespace, key, version: ++version, previous });
    schedule();
  };

  const onHide = (): void => {
    if (document.visibilityState === 'hidden') void flush();
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onHide);

  /** The shared entity of a write: a key already held in memory, else the one the write's meta resolves to. */
  const entityFor = (fullKey: string, meta: StorageWriteMeta | undefined): { entity: KvSyncEntity; namespace: string; key: string } | undefined => {
    const parsed = parseStorageKey(fullKey);
    if (!parsed) return undefined;
    const held = shared.has(fullKey);
    const entity = kvSyncEntityOf(parsed.namespace, parsed.key, meta?.policy ?? (held ? 'local' : undefined), meta?.scope ?? (held ? 'environment' : undefined));
    if (!entity) return undefined;
    const category = categoryOf(entity.entityType);
    if (!held && (!category || !access[category])) return undefined;
    return { entity, ...parsed };
  };

  return {
    get: (key) => shared.get(key) ?? local.get(key),
    set(key, value, meta) {
      const target = entityFor(key, meta);
      if (!target) return local.set(key, value, meta);
      if (shared.get(key) === value) return true;
      if (engine.connection.state() !== 'live') {
        notifyRefusal();
        handBack(key, shared.get(key));
        return false;
      }
      mark(key, target.entity, target.namespace, target.key);
      shared.set(key, value);
      return true;
    },
    remove(key) {
      if (!shared.has(key)) {
        local.remove(key);
        return;
      }
      const target = entityFor(key, undefined);
      if (!target) {
        shared.delete(key);
        return;
      }
      if (engine.connection.state() !== 'live') {
        notifyRefusal();
        handBack(key, shared.get(key));
        return;
      }
      mark(key, target.entity, target.namespace, target.key);
      shared.delete(key);
    },
    keys: (prefix) => [...new Set([...shared.keys(), ...local.keys(prefix)])].filter((k) => k.startsWith(prefix)),
    applyRemote(namespace, key, value) {
      const fullKey = toStorageKey(namespace, key);
      if (dirty.has(fullKey)) return false;
      if (value === null || value === undefined) shared.delete(fullKey);
      else shared.set(fullKey, JSON.stringify(value));
      return true;
    },
    flush,
    pendingCount: () => dirty.size,
    setAdopter(fn) {
      adopt = fn;
    },
    dispose() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onHide);
    },
  };
}
