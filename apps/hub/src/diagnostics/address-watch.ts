import { getMeta, setMeta } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { listHubAddresses, stableAddresses } from './addresses.js';
import type { InterfaceMap } from './addresses.js';

/** Detection only (PD-064): the Hub records its own addresses and audits a change; it never updates DNS. */
export const ADDRESS_META_KEY = 'hub_addresses';
export const ADDRESS_WATCH_INTERVAL_MS = 5 * 60_000;
export const ADDRESS_LIST_LIMIT = 16;

export interface AddressRecord { addresses: string[]; at: string }
export interface AddressChange { first: boolean; changed: boolean; added: string[]; removed: string[] }

export function readAddressRecord(db: Db): AddressRecord | null {
  const raw = getMeta(db, ADDRESS_META_KEY);
  if (raw === undefined) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AddressRecord>;
    if (Array.isArray(parsed.addresses) && parsed.addresses.every((a) => typeof a === 'string')) return { addresses: [...parsed.addresses].sort(), at: String(parsed.at ?? '') };
  } catch { /* an unreadable record is treated as absent */ }
  return null;
}

export interface AddressWatchOptions {
  db: Db;
  now?: () => number;
  intervalMs?: number;
  interfaces?: () => InterfaceMap;
  /** Writes `network.address-changed` (outcome success, actor system). */
  audit: (event: 'network.address-changed', detail: { added: string[]; removed: string[] }) => void;
}

/** The startup JSON notice line for a changed set (same style as `tls-names-stale`), or null when nothing changed. */
export function addressChangeNotice(change: AddressChange): string | null {
  if (!change.changed) return null;
  return JSON.stringify({ event: 'addresses-changed', added: change.added, removed: change.removed, hint: 'Update the DNS records for this Hub (router DDNS client or your DNS provider); if a name changed, run "dude-hub tls names add <name>" and "dude-hub tls acme issue".' });
}

export function createAddressWatch(options: AddressWatchOptions) {
  const now = options.now ?? Date.now;
  let timer: NodeJS.Timeout | undefined;

  function runOnce(): AddressChange {
    const current = stableAddresses(listHubAddresses(options.interfaces?.()));
    const stored = readAddressRecord(options.db);
    const store = (): void => setMeta(options.db, ADDRESS_META_KEY, JSON.stringify({ addresses: current, at: new Date(now()).toISOString() } satisfies AddressRecord));
    if (stored === null) { store(); return { first: true, changed: false, added: [], removed: [] }; }
    const before = new Set(stored.addresses);
    const after = new Set(current);
    const added = current.filter((a) => !before.has(a));
    const removed = stored.addresses.filter((a) => !after.has(a));
    if (added.length === 0 && removed.length === 0) return { first: false, changed: false, added: [], removed: [] };
    store();
    const bounded = { added: added.slice(0, ADDRESS_LIST_LIMIT), removed: removed.slice(0, ADDRESS_LIST_LIMIT) };
    options.audit('network.address-changed', bounded);
    return { first: false, changed: true, ...bounded };
  }

  const safeRun = (): void => {
    try { runOnce(); } catch { /* retried at the next interval */ }
  };

  return {
    runOnce,
    /** Schedules the periodic check (unref'd); the caller runs `runOnce()` itself at startup to report the change. */
    start(): void {
      if (timer !== undefined) return;
      timer = setInterval(safeRun, options.intervalMs ?? ADDRESS_WATCH_INTERVAL_MS);
      timer.unref();
    },
    stop(): void {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    },
  };
}
