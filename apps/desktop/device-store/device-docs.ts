import { isDeviceStoreReady, storeCall } from './store-client';

/**
 * Small named JSON documents (desktop preferences, engine settings, ...) kept in the Device State
 * Store. While the store is degraded they live in an in-memory map only: values persist for the
 * session, never to disk. A doc name is kebab-case (`^[a-z0-9][a-z0-9.-]{0,63}$`, validated by the agent).
 */

const memory = new Map<string, unknown>();
let loggedDegraded = false;

function noteDegraded(): void {
  if (loggedDegraded) return;
  loggedDegraded = true;
  console.warn('[device-docs] The device store is unavailable; settings are kept in memory for this session only.');
}

/** `decode` returns null for an unusable value, in which case `fallback` is returned. */
export async function loadDoc<T>(name: string, decode: (raw: unknown) => T | null, fallback: T): Promise<T> {
  let raw: unknown = null;
  if (isDeviceStoreReady()) {
    try { raw = await storeCall('docs.get', { name }); } catch { raw = memory.get(name) ?? null; }
  } else {
    noteDegraded();
    raw = memory.get(name) ?? null;
  }
  if (raw === null || raw === undefined) return fallback;
  try { return decode(raw) ?? fallback; } catch { return fallback; }
}

export async function saveDoc(name: string, value: unknown): Promise<void> {
  if (isDeviceStoreReady()) {
    try { await storeCall('docs.set', { name, value }); memory.delete(name); return; } catch { /* fall through to memory */ }
  } else noteDegraded();
  memory.set(name, value);
}

export async function removeDoc(name: string): Promise<void> {
  memory.delete(name);
  if (isDeviceStoreReady()) {
    try { await storeCall('docs.remove', { name }); } catch { /* best effort */ }
  }
}

/** Specs only. */
export function resetDeviceDocsForTesting(): void {
  memory.clear();
  loggedDegraded = false;
}
