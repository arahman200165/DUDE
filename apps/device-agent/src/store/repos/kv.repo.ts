import { resolveToolKeyScope } from '@dude/persistence';
import type { KeyValueRepository, KvEntry, KvKey, KvWriteMeta } from '@dude/persistence';
import type { KvMutation } from '@dude/contracts';
import type { DataScope } from '@dude/domain';
import type { PersistencePolicy } from '@dude/shared-types/shared/models/persistence-policy.model';
import type { Db } from '../sqlite.js';
import { transaction } from '../sqlite.js';

interface KvRow { namespace: string; key: string; value_json: string }

export type ScopeResolver = (policy: PersistencePolicy) => DataScope;

function upsert(db: Db, namespace: string, key: string, value: unknown, policy: string, scope: string, now: string): void {
  const json = JSON.stringify(value === undefined ? null : value);
  db.prepare(
    `INSERT INTO kv(namespace, key, value_json, policy, scope, updated_at) VALUES(?, ?, ?, ?, ?, ?)
     ON CONFLICT(namespace, key) DO UPDATE SET value_json = excluded.value_json, policy = excluded.policy, scope = excluded.scope, updated_at = excluded.updated_at`,
  ).run(namespace, key, json, policy, scope, now);
}

/** Apply a batch of key/value mutations in one transaction (all or nothing). */
export function commitKvBatch(db: Db, mutations: readonly KvMutation[], scopeOf: ScopeResolver = (p) => resolveToolKeyScope(p), now: () => Date = () => new Date()): void {
  const stamp = now().toISOString();
  transaction(db, () => {
    for (const m of mutations) {
      if (m.remove) db.prepare('DELETE FROM kv WHERE namespace = ? AND key = ?').run(m.namespace, m.key);
      else upsert(db, m.namespace, m.key, m.value, m.policy, m.scope ?? scopeOf(m.policy), stamp);
    }
  });
}

export class SqliteKeyValueRepository implements KeyValueRepository {
  constructor(private readonly db: Db, private readonly now: () => Date = () => new Date()) {}

  async get(namespace: string, key: string): Promise<unknown | undefined> {
    const row = this.db.prepare('SELECT value_json FROM kv WHERE namespace = ? AND key = ?').get(namespace, key) as { value_json: string } | undefined;
    return row ? JSON.parse(row.value_json) : undefined;
  }

  async set(namespace: string, key: string, value: unknown, meta: KvWriteMeta): Promise<void> {
    upsert(this.db, namespace, key, value, meta.policy, meta.scope, this.now().toISOString());
  }

  async remove(namespace: string, key: string): Promise<void> {
    this.db.prepare('DELETE FROM kv WHERE namespace = ? AND key = ?').run(namespace, key);
  }

  async keys(nsPrefix?: string): Promise<KvKey[]> {
    const rows = (nsPrefix === undefined
      ? this.db.prepare('SELECT namespace, key FROM kv ORDER BY namespace, key').all()
      : this.db.prepare('SELECT namespace, key FROM kv WHERE substr(namespace, 1, ?) = ? ORDER BY namespace, key').all(nsPrefix.length, nsPrefix)) as unknown as KvRow[];
    return rows.map((r) => ({ namespace: r.namespace, key: r.key }));
  }

  async snapshot(): Promise<KvEntry[]> {
    const rows = this.db.prepare('SELECT namespace, key, value_json FROM kv ORDER BY namespace, key').all() as unknown as KvRow[];
    return rows.map((r) => ({ namespace: r.namespace, key: r.key, value: JSON.parse(r.value_json) }));
  }
}
