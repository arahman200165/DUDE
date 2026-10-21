/** Local-only recently opened tools. Persisted on this device only; never a sync record or outbox operation. */
export const MAX_RECENTS = 8;
export const RECENTS_NAMESPACE = 'mobile.local';
export const RECENTS_KEY = 'recentTools';

export function pushRecent(list: readonly string[], id: string, max = MAX_RECENTS): readonly string[] {
  return [id, ...list.filter(existing => existing !== id)].slice(0, max);
}
export function sanitizeRecents(raw: unknown, max = MAX_RECENTS): readonly string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const value of raw) if (typeof value === 'string' && value) seen.add(value);
  return [...seen].slice(0, max);
}

/** Device-local key/value port supplied by the durable workbench; absent in the memory workbench. */
export interface LocalStatePort {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

export class RecentsStore {
  private items: readonly string[] = [];
  private port: LocalStatePort | null = null;
  private generation = 0;
  private writes: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<() => void>();
  constructor(private readonly max = MAX_RECENTS) {}

  list = (): readonly string[] => this.items;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };

  /** Attaches (or re-attaches after a context change) the persistence port and loads its list, keeping anything recorded meanwhile. */
  async bind(port: LocalStatePort | null): Promise<void> {
    this.port = port;
    const generation = ++this.generation;
    if (!port) return;
    let stored: readonly string[] = [];
    try { stored = sanitizeRecents(await port.get(RECENTS_KEY), this.max); } catch { /* unreadable storage: keep the memory list */ }
    if (generation !== this.generation) return;
    const merged = [...this.items, ...stored.filter(id => !this.items.includes(id))].slice(0, this.max);
    const changed = merged.length !== stored.length || merged.some((id, index) => id !== stored[index]);
    this.publish(merged);
    // Recorded before the load finished: persist the merged order so older stored entries are not lost.
    if (changed && this.items.length) this.writes = this.writes.then(() => port.set(RECENTS_KEY, this.items)).catch(() => undefined);
  }
  record(id: string): void {
    const next = pushRecent(this.items, id, this.max);
    if (next.length === this.items.length && next.every((value, index) => value === this.items[index])) return;
    this.publish(next);
    const port = this.port;
    if (port) this.writes = this.writes.then(() => port.set(RECENTS_KEY, this.items)).catch(() => undefined);
  }
  /** Resolves when queued writes finish (tests). */
  flush(): Promise<void> { return this.writes; }
  private publish(next: readonly string[]): void { this.items = next; for (const listener of [...this.listeners]) listener(); }
}

export const recentsStore = new RecentsStore();
