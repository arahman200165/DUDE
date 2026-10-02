import type { NetworkRunAddResult, NetworkRunRecord, NetworkRunRepository, NetworkRunRetention } from '@dude/persistence';
import type { Db } from '../sqlite.js';
import { transaction } from '../sqlite.js';
import { DEFAULT_NETWORK_RUN_RETENTION } from './retention.js';

interface Row { id: string; created_at: number; size_bytes: number; payload_json: string }

const toRecord = (r: Row): NetworkRunRecord => ({ id: r.id, createdAt: r.created_at, sizeBytes: r.size_bytes, payload: JSON.parse(r.payload_json) });

export class SqliteNetworkRunRepository implements NetworkRunRepository {
  constructor(
    private readonly db: Db,
    private readonly retention: NetworkRunRetention = DEFAULT_NETWORK_RUN_RETENTION,
    private readonly now: () => number = Date.now,
  ) {}

  async add(run: NetworkRunRecord): Promise<NetworkRunAddResult> {
    if (run.sizeBytes > this.retention.maxTotalBytes) return { ok: false, error: 'too-large' };
    const { db, retention } = this;
    const evicted = transaction(db, () => {
      db.prepare('INSERT OR REPLACE INTO network_runs(id, created_at, size_bytes, payload_json) VALUES(?, ?, ?, ?)')
        .run(run.id, run.createdAt, run.sizeBytes, JSON.stringify(run.payload ?? null));
      let n = Number(db.prepare('DELETE FROM network_runs WHERE created_at < ?').run(this.now() - retention.maxAgeMs).changes);
      const rows = db.prepare('SELECT id, size_bytes FROM network_runs ORDER BY created_at DESC, rowid DESC').all() as unknown as Array<{ id: string; size_bytes: number }>;
      let kept = 0;
      let bytes = 0;
      const doomed: string[] = [];
      for (const row of rows) {
        if (kept >= retention.maxRuns || bytes + row.size_bytes > retention.maxTotalBytes) { doomed.push(row.id); continue; }
        kept++;
        bytes += row.size_bytes;
      }
      const del = db.prepare('DELETE FROM network_runs WHERE id = ?');
      for (const id of doomed) n += Number(del.run(id).changes);
      return n;
    });
    return { ok: true, evicted };
  }

  async list(): Promise<NetworkRunRecord[]> {
    const rows = this.db.prepare('SELECT * FROM network_runs ORDER BY created_at DESC, rowid DESC').all() as unknown as Row[];
    return rows.map(toRecord);
  }

  async get(id: string): Promise<NetworkRunRecord | undefined> {
    const row = this.db.prepare('SELECT * FROM network_runs WHERE id = ?').get(id) as unknown as Row | undefined;
    return row ? toRecord(row) : undefined;
  }

  async remove(id: string): Promise<void> { this.db.prepare('DELETE FROM network_runs WHERE id = ?').run(id); }
  async clear(): Promise<void> { this.db.exec('DELETE FROM network_runs'); }
}
