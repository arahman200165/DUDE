import { isDevMode } from '@angular/core';
import type { DeviceStoreBoot, KvMutation } from '@dude/contracts';
import type { PlatformBridge } from '@dude/contracts/shared/models/platform-bridge.model';
import type { PersistencePolicy } from '@dude/shared-types/shared/models/persistence-policy.model';
import type { DataScope } from '@dude/domain';
import { NAMESPACE_PREFIX } from '@dude/tool-engine/core/persistence/persistence-keys';
import type { StorageBackend, StorageWriteMeta } from '../storage-backend';

const NAMESPACE = /^[A-Za-z0-9_.-]{1,64}$/;
const KEY = /^[A-Za-z0-9_.:-]{1,128}$/;
const MAX_VALUE_CHARS = 2 * 1024 * 1024;
const MAX_BATCH = 1000;
const PREFIX = `${NAMESPACE_PREFIX}:`;

export type DeviceKvBridge = Pick<PlatformBridge['store'], 'commitKv' | 'commitKvNoWait' | 'onFlushRequest'>;

export interface DeviceKvBackendOptions {
  readonly debounceMs?: number;
  /** Keys that flush right away instead of waiting out the debounce (journaled settings). */
  readonly immediate?: (namespace: string, key: string) => boolean;
}

export interface DeviceKvBackend extends StorageBackend {
  /** Resolves once every in-flight and pending commit has settled (never rejects). */
  flush(): Promise<void>;
  /** Number of keys not yet committed. */
  pendingCount(): number;
  dispose(): void;
}

/**
 * Splits a full storage key (`dude:v1:<namespace>:<key>`) into the store's (namespace, key). The namespace
 * is the first segment; the rest (colons included) is the key, so consent keys
 * (`dude:v1:__consent__:<toolId>:<key>`) map to namespace `__consent__` and key `<toolId>:<key>`.
 * Returns null for anything main would reject.
 */
export function parseStorageKey(fullKey: string): { namespace: string; key: string } | null {
  if (!fullKey.startsWith(PREFIX)) return null;
  const rest = fullKey.slice(PREFIX.length);
  const split = rest.indexOf(':');
  if (split < 1) return null;
  const namespace = rest.slice(0, split);
  const key = rest.slice(split + 1);
  return NAMESPACE.test(namespace) && KEY.test(key) ? { namespace, key } : null;
}

export function toStorageKey(namespace: string, key: string): string {
  return `${PREFIX}${namespace}:${key}`;
}

/** Hydration gives parsed JSON; the in-memory cache holds the same raw strings window.localStorage did. */
function toRaw(value: unknown): string {
  return JSON.stringify(value === undefined ? null : value);
}

function fromRaw(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

interface Pending { policy: PersistencePolicy; scope?: DataScope; version: number }
interface Entry { fullKey: string; pending: Pending; mutation: KvMutation }

/**
 * `local` StorageBackend over the Device Store: a synchronous in-memory cache seeded from the boot snapshot,
 * a dirty set flushed in one `commitKv` batch after a debounce (journaled keys flush at once), a flush on
 * the main process's quit request, and a fire-and-forget commit on `pagehide`.
 */
export function createDeviceKvBackend(boot: Pick<DeviceStoreBoot, 'kv'>, bridge: DeviceKvBridge, options: DeviceKvBackendOptions = {}): DeviceKvBackend {
  const debounceMs = options.debounceMs ?? 1000;
  const cache = new Map<string, string>();
  const dirty = new Map<string, Pending>();
  let version = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<void> = Promise.resolve();
  let failureLogged = false;

  for (const row of boot.kv) cache.set(toStorageKey(row.namespace, row.key), toRaw(row.value));

  const warnOnce = (message: string, error?: unknown): void => {
    if (failureLogged) return;
    failureLogged = true;
    console.warn(`[DeviceKvBackend] ${message}`, error ?? '');
  };

  const snapshot = (): Entry[] => {
    const out: Entry[] = [];
    for (const [fullKey, pending] of dirty) {
      const parsed = parseStorageKey(fullKey);
      if (!parsed) continue;
      const raw = cache.get(fullKey);
      const mutation: KvMutation = { ...parsed, policy: pending.policy };
      if (pending.scope) mutation.scope = pending.scope;
      if (raw === undefined) mutation.remove = true;
      else mutation.value = fromRaw(raw);
      out.push({ fullKey, pending, mutation });
    }
    return out;
  };

  const commitPending = async (): Promise<void> => {
    const entries = snapshot();
    for (let i = 0; i < entries.length; i += MAX_BATCH) {
      const chunk = entries.slice(i, i + MAX_BATCH);
      try {
        const result = await bridge.commitKv(chunk.map((entry) => entry.mutation));
        if (!result.ok) {
          warnOnce(`commit failed: ${result.error}`);
          return;
        }
      } catch (error) {
        warnOnce('commit failed', error);
        return;
      }
      failureLogged = false;
      // A key rewritten while the commit was in flight has a newer version and stays dirty.
      for (const { fullKey, pending } of chunk) if (dirty.get(fullKey)?.version === pending.version) dirty.delete(fullKey);
    }
  };

  const flush = (): Promise<void> => {
    if (timer !== null) { clearTimeout(timer); timer = null; }
    chain = chain.then(commitPending, commitPending);
    return chain;
  };

  const schedule = (): void => {
    if (timer !== null) return;
    timer = setTimeout(() => { timer = null; void flush(); }, debounceMs);
  };

  const mark = (fullKey: string, meta?: StorageWriteMeta): void => {
    const parsed = parseStorageKey(fullKey);
    if (!parsed) {
      if (isDevMode()) console.warn(`[DeviceKvBackend] "${fullKey}" is not a storable key; kept in memory only.`);
      return;
    }
    dirty.set(fullKey, { policy: meta?.policy ?? 'local', scope: meta?.scope, version: ++version });
    if (options.immediate?.(parsed.namespace, parsed.key)) void flush();
    else schedule();
  };

  const onHide = (): void => {
    const entries = snapshot();
    for (let i = 0; i < entries.length; i += MAX_BATCH) {
      try { bridge.commitKvNoWait(entries.slice(i, i + MAX_BATCH).map((entry) => entry.mutation)); } catch { /* page is going away */ }
    }
  };
  const hasWindow = typeof window !== 'undefined';
  if (hasWindow) {
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);
  }
  const unsubscribeFlush = bridge.onFlushRequest(() => flush());

  return {
    get: (key) => cache.get(key) ?? null,
    set(key, value, meta) {
      if (value.length > MAX_VALUE_CHARS) {
        if (isDevMode()) console.warn(`[DeviceKvBackend] value for "${key}" exceeds the store limit; not saved.`);
        return false;
      }
      if (cache.get(key) === value) return true;
      cache.set(key, value);
      mark(key, meta);
      return true;
    },
    remove(key) {
      if (!cache.delete(key)) return;
      mark(key);
    },
    keys: (prefix) => [...cache.keys()].filter((key) => key.startsWith(prefix)),
    applyRemote(namespace, key, value) {
      const fullKey = toStorageKey(namespace, key);
      if (dirty.has(fullKey)) return false;
      if (value === null || value === undefined) cache.delete(fullKey);
      else cache.set(fullKey, toRaw(value));
      return true;
    },
    flush,
    pendingCount: () => dirty.size,
    dispose() {
      if (timer !== null) { clearTimeout(timer); timer = null; }
      if (hasWindow) {
        window.removeEventListener('pagehide', onHide);
        window.removeEventListener('beforeunload', onHide);
      }
      unsubscribeFlush();
    },
  };
}

/** In-memory `local` backend for a desktop launch whose store could not hydrate: edits are not saved. */
export function createDegradedMemoryBackend(): StorageBackend {
  const cache = new Map<string, string>();
  return {
    get: (key) => cache.get(key) ?? null,
    set(key, value) { cache.set(key, value); return true; },
    remove(key) { cache.delete(key); },
    keys: (prefix) => [...cache.keys()].filter((key) => key.startsWith(prefix)),
  };
}
