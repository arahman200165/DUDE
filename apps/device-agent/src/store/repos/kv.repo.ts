import { SETTING_ENTITY_TYPE, findKvEntityBinding, findSettingDefinition, isSyncableSettingKey, resolveToolKeyScope } from '@dude/persistence';
import type { KeyValueRepository, KvEntry, KvKey, KvWriteMeta } from '@dude/persistence';
import type { KvMutation } from '@dude/contracts';
import type { DataScope } from '@dude/domain';
import type { PersistencePolicy } from '@dude/shared-types/shared/models/persistence-policy.model';
import type { Db } from '@dude/sqlite-store';
import { transaction } from '@dude/sqlite-store';
import { recordOutboxOp } from '../entity-commit.js';
import type { CommitContext } from '../entity-commit.js';
import { OUTBOX_SCHEMA_VERSION } from '@dude/sync';
import { clearKvSync, getKvSync, setKvSync } from './kv-sync.repo.js';

interface KvRow { namespace: string; key: string; value_json: string }

export type ScopeResolver = (policy: PersistencePolicy) => DataScope;

function upsert(db: Db, namespace: string, key: string, value: unknown, policy: string, scope: string, now: string): void {
  const json = JSON.stringify(value === undefined ? null : value);
  db.prepare(
    `INSERT INTO kv(namespace, key, value_json, policy, scope, updated_at) VALUES(?, ?, ?, ?, ?, ?)
     ON CONFLICT(namespace, key) DO UPDATE SET value_json = excluded.value_json, policy = excluded.policy, scope = excluded.scope, updated_at = excluded.updated_at`,
  ).run(namespace, key, json, policy, scope, now);
}

export { SETTING_ENTITY_TYPE };

const TOOL_ID = /^[a-z0-9][a-z0-9-]*$/;

interface KvJournal { entityType: string; entityId: string; payload: (value: unknown) => unknown }

/**
 * Tool preferences sync when the write is a `local`-policy key the renderer resolved to `environment` scope (it applies
 * the manifest `settingScopes` before writing), in a tool-id-shaped namespace. The agent may not depend on the tool
 * registry, so it feeds that resolved scope to the shared predicate as a one-tool manifest; the Hub re-validates with the
 * real manifests and quarantines anything it rejects.
 */
function isSyncableToolPref(m: Pick<KvMutation, 'namespace' | 'key' | 'policy'>, scope: string): boolean {
  if (m.policy !== 'local' || scope !== 'environment' || !TOOL_ID.test(m.namespace)) return false;
  return isSyncableSettingKey(m.namespace, m.key, [{ id: m.namespace, persistence: { preferences: 'local' }, settingScopes: { [m.key]: { scope: 'environment' } } }]);
}

/** The sync entity a stored kv row journals as (same rule as `journalFor`), or undefined when it is device-local. */
export function kvSyncEntity(namespace: string, key: string, policy: string, scope: string): { entityType: string; entityId: string } | undefined {
  const binding = findKvEntityBinding(namespace, key);
  if (binding) return { entityType: binding.entityType, entityId: binding.entityId };
  if (findSettingDefinition(namespace, key)?.journal === true || isSyncableToolPref({ namespace, key, policy: policy as KvMutation['policy'] }, scope)) {
    return { entityType: SETTING_ENTITY_TYPE, entityId: `${namespace}:${key}` };
  }
  return undefined;
}

/**
 * How a kv key journals, or undefined when it does not. A bound singleton (workspace layout, scratchpad) journals
 * as its own entity with the value as payload; a `journal: true` core key or a syncable setting journals as a
 * `setting` op with payload `{namespace, key, value}`.
 */
function journalFor(m: KvMutation, scope: string): KvJournal | undefined {
  const { namespace, key } = m;
  const binding = findKvEntityBinding(namespace, key);
  if (binding) return { entityType: binding.entityType, entityId: binding.entityId, payload: (value) => value };
  if (findSettingDefinition(namespace, key)?.journal === true || isSyncableToolPref(m, scope)) {
    return { entityType: SETTING_ENTITY_TYPE, entityId: `${namespace}:${key}`, payload: (value) => ({ namespace, key, value }) };
  }
  return undefined;
}

/**
 * Apply a batch of key/value mutations in one transaction (all or nothing). With `outbox` supplied, every
 * mutation of a syncable key (see `journalFor`) also writes its coalesced outbox op in that same transaction, based
 * on the Hub revision recorded in `kv_sync`; the store decides journaling, the renderer cannot force it.
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
      const scope = m.scope ?? scopeOf(m.policy);
      if (m.remove) db.prepare('DELETE FROM kv WHERE namespace = ? AND key = ?').run(m.namespace, m.key);
      else upsert(db, m.namespace, m.key, m.value, m.policy, scope, stamp);
      const journal = outbox ? journalFor(m, scope) : undefined;
      if (outbox && journal) {
        const prev = db.prepare('SELECT local_revision FROM outbox WHERE entity_type = ? AND entity_id = ?').get(journal.entityType, journal.entityId) as { local_revision: number } | undefined;
        recordOutboxOp(db, outbox, {
          entityType: journal.entityType,
          entityId: journal.entityId,
          opKind: m.remove ? 'delete' : 'upsert',
          schemaVersion: OUTBOX_SCHEMA_VERSION,
          basedOnRevision: getKvSync(db, m.namespace, m.key)?.hubRevision ?? null,
          localRevision: (prev?.local_revision ?? 0) + 1,
          payload: m.remove ? null : journal.payload(m.value === undefined ? null : m.value),
        });
      }
    }
  });
}

/** Writes a value the Hub sent into the kv WITHOUT journaling, and records its Hub revision/base in `kv_sync`. */
export function applyRemoteKv(db: Db, namespace: string, key: string, value: unknown, hubRevision: number, base: unknown, now: Date, policy = 'local', scope = 'environment'): void {
  transaction(db, () => {
    upsert(db, namespace, key, value, policy, scope, now.toISOString());
    setKvSync(db, namespace, key, hubRevision, base);
  });
}

/** Removes a kv value the Hub deleted WITHOUT journaling; `hubRevision` (the tombstone's) is kept so later edits are based on it. */
export function applyRemoteKvDelete(db: Db, namespace: string, key: string, hubRevision: number | null): void {
  transaction(db, () => {
    db.prepare('DELETE FROM kv WHERE namespace = ? AND key = ?').run(namespace, key);
    if (hubRevision === null) clearKvSync(db, namespace, key);
    else setKvSync(db, namespace, key, hubRevision, null);
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
