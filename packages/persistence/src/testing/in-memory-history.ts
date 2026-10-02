import type { HistoryAddResult, HistoryRecord, HistoryRepository, HistoryRetention } from '../repositories/ports.js';

/**
 * In-memory HistoryRepository. Retention is enforced on add: entries larger than `maxEntryBytes`
 * are rejected with `{ ok: false, error: 'too-large' }` (not thrown); entries older than `maxAgeMs`,
 * then the oldest beyond `maxPerTool` and `maxTotal`, are evicted. `now` is injected.
 */
export class InMemoryHistoryRepository implements HistoryRepository {
  private rows: HistoryRecord[] = [];

  constructor(private readonly retention: HistoryRetention, private readonly now: () => number = () => 0) {}

  async add(entry: HistoryRecord): Promise<HistoryAddResult> {
    if (entry.sizeBytes > this.retention.maxEntryBytes) return { ok: false, error: 'too-large' };
    this.rows = this.rows.filter(r => r.id !== entry.id);
    this.rows.push({ ...entry });
    let evicted = 0;
    const cutoff = this.now() - this.retention.maxAgeMs;
    const drop = (predicate: (r: HistoryRecord) => boolean): void => {
      const kept = this.rows.filter(r => !predicate(r));
      evicted += this.rows.length - kept.length;
      this.rows = kept;
    };
    drop(r => r.createdAt < cutoff);
    const sorted = (): HistoryRecord[] => [...this.rows].sort((a, b) => b.createdAt - a.createdAt);
    const doomed = new Set<string>();
    const perTool = new Map<string, number>();
    for (const r of sorted()) {
      const n = (perTool.get(r.toolId) ?? 0) + 1;
      perTool.set(r.toolId, n);
      if (n > this.retention.maxPerTool) doomed.add(r.id);
    }
    drop(r => doomed.has(r.id));
    sorted().slice(this.retention.maxTotal).forEach(r => doomed.add(r.id));
    drop(r => doomed.has(r.id));
    return { ok: true, evicted };
  }

  async listByTool(toolId: string): Promise<HistoryRecord[]> {
    return this.newestFirst().filter(r => r.toolId === toolId);
  }

  async listRecent(limit: number): Promise<HistoryRecord[]> {
    return this.newestFirst().slice(0, Math.max(0, limit));
  }

  async get(id: string): Promise<HistoryRecord | undefined> {
    const row = this.rows.find(r => r.id === id);
    return row ? { ...row } : undefined;
  }

  async remove(id: string): Promise<void> {
    this.rows = this.rows.filter(r => r.id !== id);
  }

  async clear(): Promise<void> {
    this.rows = [];
  }

  async clearTool(toolId: string): Promise<void> {
    this.rows = this.rows.filter(r => r.toolId !== toolId);
  }

  private newestFirst(): HistoryRecord[] {
    return [...this.rows].sort((a, b) => b.createdAt - a.createdAt).map(r => ({ ...r }));
  }
}
