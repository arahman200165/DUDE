import { findSettingDefinition, resolveToolKeyScope } from '@dude/persistence';
import type { KeyValueRepository, KvEntry, KvKey, KvWriteMeta } from '@dude/persistence';
import type { KvMutation } from '@dude/contracts';
import type { DataScope } from '@dude/domain';
import type { PersistencePolicy } from '@dude/shared-types/shared/models/persistence-policy.model';
import type { Db } from '../sqlite.js';
import { transaction } from '../sqlite.js';
import { recordOutboxOp } from '../entity-commit.js';
import type { CommitContext } from '../entity-commit.js';
import { OUTBOX_SCHEMA_VERSION } from '@dude/sync';

interface KvRow { namespace: string; key: string; value_json: string }

export type ScopeResolver = (policy: PersistencePolicy) => DataScope;

function upsert(db: Db, namespace: string, key: string, value: unknown, policy: string, scope: string, now: string): void {
  const json = JSON.stringify(value === undefined ? null : value);
  db.prepare(
    `INSERT INTO kv(namespace, key, value_json, policy, scope, updated_at) VALUES(?, ?, ?, ?, ?, ?)
     ON CONFLICT(namespace, key) DO UPDATE SET value_json = excluded.value_json, policy = excluded.policy, scope = excluded.scope, updated_at = excluded.updated_at`,
  ).run(namespace, key, json, policy, scope, now);
}

/** Entity type of a journaled kv setting's outbox op; the id is `<namespace>:<key>`. Needs no entity codec. */
export const SETTING_ENTITY_TYPE = 'setting';

/**
 * Apply a batch of key/value mutations in one transaction (all or nothing). With `outbox` supplied, every
 * mutation of a key whose `SETTING_DEFINITIONS` entry has `journal: true` also writes its coalesced outbox op in
 * that same transaction; the store decides journaling, the renderer cannot force it.
 */
export function commitKvBatch(
  db: Db,
  mutations: readonly KvMutation[],
  scopeOf: ScopeResolver = (p) => resolveToolKeyScope(p),
  now: () => Date = () => new Date(),
  outbox?: CommitContext,
): void {
  const stamp = now().toISOString();
  transaction(db, () => {
    for (const m of mutations) {
      if (m.remove) db.prepare('DELETE FROM kv WHERE namespace = ? AND key = ?').run(m.namespace, m.key);
      else upsert(db, m.namespace, m.key, m.value, m.policy, m.scope ?? scopeOf(m.policy), stamp);
      if (outbox && findSettingDefinition(m.namespace, m.key)?.journal === true) {
        const entityId = `${m.namespace}:${m.key}`;
        const prev = db.prepare('SELECT local_revision FROM outbox WHERE entity_type = ? AND entity_id = ?').get(SETTING_ENTITY_TYPE, entityId) as { local_revision: number } | undefined;
        recordOutboxOp(db, outbox, {
          entityType: SETTING_ENTITY_TYPE,
          entityId,
          opKind: m.remove ? 'delete' : 'upsert',
          schemaVersion: OUTBOX_SCHEMA_VERSION,
          basedOnRevision: null,
          localRevision: (prev?.local_revision ?? 0) + 1,
          payload: m.remove ? null : (m.value === undefined ? null : m.value),
        });
      }
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
