import type { NetworkRunAddResult, NetworkRunRecord, NetworkRunRepository, NetworkRunRetention } from '../repositories/ports.js';

/**
 * In-memory NetworkRunRepository. Retention on add: a run larger than `maxTotalBytes` is rejected
 * with `{ ok: false, error: 'too-large' }`; runs older than `maxAgeMs`, then the oldest beyond
 * `maxRuns` or `maxTotalBytes`, are evicted. `now` is injected.
 */
export class InMemoryNetworkRunRepository implements NetworkRunRepository {
  private rows: NetworkRunRecord[] = [];

  constructor(private readonly retention: NetworkRunRetention, private readonly now: () => number = () => 0) {}

  async add(run: NetworkRunRecord): Promise<NetworkRunAddResult> {
    if (run.sizeBytes > this.retention.maxTotalBytes) return { ok: false, error: 'too-large' };
    this.rows = this.rows.filter(r => r.id !== run.id);
    this.rows.push({ ...run });
    const startCount = this.rows.length;
    const cutoff = this.now() - this.retention.maxAgeMs;
    this.rows = this.rows.filter(r => r.createdAt >= cutoff);
    const newest = [...this.rows].sort((a, b) => b.createdAt - a.createdAt);
    const keep: NetworkRunRecord[] = [];
    let bytes = 0;
    for (const r of newest) {
      if (keep.length >= this.retention.maxRuns || bytes + r.sizeBytes > this.retention.maxTotalBytes) continue;
      keep.push(r);
      bytes += r.sizeBytes;
    }
    this.rows = keep;
    return { ok: true, evicted: startCount - keep.length };
  }

  async list(): Promise<NetworkRunRecord[]> {
    return [...this.rows].sort((a, b) => b.createdAt - a.createdAt).map(r => ({ ...r }));
  }

  async get(id: string): Promise<NetworkRunRecord | undefined> {
    const row = this.rows.find(r => r.id === id);
    return row ? { ...row } : undefined;
  }

  async remove(id: string): Promise<void> {
    this.rows = this.rows.filter(r => r.id !== id);
  }

  async clear(): Promise<void> {
    this.rows = [];
  }
}
