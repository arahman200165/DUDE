import type { HistoryAddResult, HistoryRecord, HistoryRepository, HistoryRetention } from '@dude/persistence';
import type { Db } from '../sqlite.js';
import { transaction } from '../sqlite.js';
import { DEFAULT_HISTORY_RETENTION } from './retention.js';

interface Row { id: string; tool_id: string; created_at: number; size_bytes: number; payload_json: string }

const toRecord = (r: Row): HistoryRecord => ({ id: r.id, toolId: r.tool_id, createdAt: r.created_at, sizeBytes: r.size_bytes, payload: JSON.parse(r.payload_json) });
const changes = (r: { changes: number | bigint }): number => Number(r.changes);

export class SqliteHistoryRepository implements HistoryRepository {
  constructor(
    private readonly db: Db,
    private readonly retention: HistoryRetention = DEFAULT_HISTORY_RETENTION,
    private readonly now: () => number = Date.now,
  ) {}

  async add(entry: HistoryRecord): Promise<HistoryAddResult> {
    if (entry.sizeBytes > this.retention.maxEntryBytes) return { ok: false, error: 'too-large' };
    const { db, retention } = this;
    const evicted = transaction(db, () => {
      db.prepare('INSERT OR REPLACE INTO history_entries(id, tool_id, created_at, size_bytes, payload_json) VALUES(?, ?, ?, ?, ?)')
        .run(entry.id, entry.toolId, entry.createdAt, entry.sizeBytes, JSON.stringify(entry.payload ?? null));
      let n = 0;
      n += changes(db.prepare('DELETE FROM history_entries WHERE created_at < ?').run(this.now() - retention.maxAgeMs));
      n += changes(db.prepare(
        `DELETE FROM history_entries WHERE tool_id = ? AND id NOT IN
           (SELECT id FROM history_entries WHERE tool_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?)`,
      ).run(entry.toolId, entry.toolId, retention.maxPerTool));
      n += changes(db.prepare(
        `DELETE FROM history_entries WHERE id NOT IN
           (SELECT id FROM history_entries ORDER BY created_at DESC, rowid DESC LIMIT ?)`,
      ).run(retention.maxTotal));
      return n;
    });
    return { ok: true, evicted };
  }

  async listByTool(toolId: string): Promise<HistoryRecord[]> {
    const rows = this.db.prepare('SELECT * FROM history_entries WHERE tool_id = ? ORDER BY created_at DESC, rowid DESC').all(toolId) as unknown as Row[];
    return rows.map(toRecord);
  }

  async listRecent(limit: number): Promise<HistoryRecord[]> {
    const rows = this.db.prepare('SELECT * FROM history_entries ORDER BY created_at DESC, rowid DESC LIMIT ?').all(Math.max(0, Math.floor(limit))) as unknown as Row[];
    return rows.map(toRecord);
  }

  async get(id: string): Promise<HistoryRecord | undefined> {
    const row = this.db.prepare('SELECT * FROM history_entries WHERE id = ?').get(id) as unknown as Row | undefined;
    return row ? toRecord(row) : undefined;
  }

  async remove(id: string): Promise<void> { this.db.prepare('DELETE FROM history_entries WHERE id = ?').run(id); }
  async clear(): Promise<void> { this.db.exec('DELETE FROM history_entries'); }
  async clearTool(toolId: string): Promise<void> { this.db.prepare('DELETE FROM history_entries WHERE tool_id = ?').run(toolId); }
}
