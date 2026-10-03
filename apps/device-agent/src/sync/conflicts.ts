import { randomBytes } from 'node:crypto';
import { SETTING_ENTITY_TYPE, uuidv7 } from '@dude/persistence';
import { SINGLETON_ENTITY_TYPES, categoryOf } from '@dude/sync';
import type { SyncCategory } from '@dude/sync';
import type { Db } from '@dude/sqlite-store';
import { transaction } from '@dude/sqlite-store';
import { commitEntity } from '../store/entity-commit.js';
import type { CommitContext } from '../store/entity-commit.js';
import { commitKvBatch } from '../store/repos/kv.repo.js';
import { deleteConflict, getConflict, listConflicts } from '../store/repos/sync-conflicts.repo.js';
import type { SyncConflict } from '../store/repos/sync-conflicts.repo.js';
import { toAppliedChange } from './apply-remote.js';
import type { AppliedChange } from './apply-remote.js';
import { readLocal, storageOf } from './sync-entities.js';

export type ConflictChoice = 'hub' | 'mine' | 'both';

export interface ConflictContext extends CommitContext {
  /** Id for a "keep both" fork; defaults to a fresh UUIDv7. */
  newEntityId?: () => string;
}

export interface ConflictView extends SyncConflict {
  category: SyncCategory | undefined;
  /** A display name (the payload's `name`, local version first) when the entity has one. */
  name: string | null;
  /** Whether "keep both" is offered. */
  canKeepBoth: boolean;
}

const COPY_SUFFIX = ' (conflict copy)';
const NO_FORK = new Set<string>([...SINGLETON_ENTITY_TYPES, SETTING_ENTITY_TYPE, 'favorite', 'usage']);

const nameOf = (payload: unknown): string | null =>
  payload !== null && typeof payload === 'object' && typeof (payload as { name?: unknown }).name === 'string' ? (payload as { name: string }).name : null;

const canFork = (c: SyncConflict): boolean => !NO_FORK.has(c.entityType) && storageOf(c.entityType, c.entityId)?.kind === 'record';

export function listConflictViews(db: Db): ConflictView[] {
  return listConflicts(db).map((c) => ({
    ...c, category: categoryOf(c.entityType), name: nameOf(c.localPayload) ?? nameOf(c.remotePayload), canKeepBoth: canFork(c),
  }));
}

export type ResolveResult = { ok: true; changes: AppliedChange[] } | { ok: false; error: string };

/** Re-journals a local version (upsert or delete) through the normal write path. Returns an error message on rejection. */
function journalLocal(db: Db, ctx: CommitContext, entityType: string, entityId: string, payload: unknown | null, deleted: boolean): string | null {
  const s = storageOf(entityType, entityId);
  if (!s) return `Malformed entity id "${entityId}".`;
  if (s.kind === 'kv') {
    const value = s.shape === 'setting' ? (payload as { value?: unknown } | null)?.value : payload;
    commitKvBatch(db, [{ namespace: s.namespace, key: s.key, policy: 'local', scope: 'environment', ...(deleted ? { remove: true } : { value }) }], undefined, ctx.now, ctx);
    return null;
  }
  const result = commitEntity(db, ctx, { entityType, entityId, op: deleted ? 'delete' : 'upsert', payload });
  return result.ok ? null : result.error;
}

/**
 * Resolves one conflict. 'hub' keeps the Hub version (already applied locally) and drops the row. 'mine' re-journals the
 * local version based on the Hub's current revision so it pushes. 'both' keeps the Hub version and saves the local one as
 * a copy with a new id and a " (conflict copy)" name suffix (not for singletons, settings, favorites or usage).
 */
export function resolveConflict(db: Db, id: number, choice: ConflictChoice, ctx: ConflictContext): ResolveResult {
  return transaction(db, (): ResolveResult => {
    const c = getConflict(db, id);
    if (!c) return { ok: false, error: 'That conflict no longer exists.' };
    const changes: AppliedChange[] = [];

    if (choice === 'mine') {
      const err = journalLocal(db, ctx, c.entityType, c.entityId, c.localPayload, c.localDeleted);
      if (err) return { ok: false, error: err };
      const current = readLocal(db, c.entityType, c.entityId).hubRevision ?? c.remoteRevision;
      if (current !== null) {
        // A tombstoned record keeps no row (so no hub revision); base the op on the revision the conflict recorded.
        db.prepare('UPDATE outbox SET based_on_revision = ? WHERE entity_type = ? AND entity_id = ? AND based_on_revision IS NULL').run(current, c.entityType, c.entityId);
      }
      changes.push(toAppliedChange(c.entityType, c.entityId, c.localDeleted, c.localPayload));
    } else if (choice === 'both') {
      if (!canFork(c)) return { ok: false, error: 'Keep both is not available for this item.' };
      if (!c.localDeleted && c.localPayload !== null && typeof c.localPayload === 'object') {
        const newId = ctx.newEntityId?.() ?? uuidv7((n) => new Uint8Array(randomBytes(n)), () => Date.now());
        const copy: Record<string, unknown> = { ...(c.localPayload as Record<string, unknown>) };
        if (Object.hasOwn(copy, 'id')) copy['id'] = newId;
        if (typeof copy['name'] === 'string') copy['name'] = `${copy['name']}${COPY_SUFFIX}`;
        const err = journalLocal(db, ctx, c.entityType, newId, copy, false);
        if (err) return { ok: false, error: err };
        changes.push(toAppliedChange(c.entityType, newId, false, copy));
      }
    }
    deleteConflict(db, id);
    return { ok: true, changes };
  });
}
