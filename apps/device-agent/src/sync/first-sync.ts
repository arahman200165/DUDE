import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { FirstSyncCategoryPreview, FirstSyncChoice, FirstSyncPreview } from '@dude/contracts';
import type { SyncRecord } from '@dude/contracts/hub';
import { SYNC_CATEGORIES, SYNC_ENTITY_TYPES, categoryOf, deepEqual, merge3, syncPolicyFor } from '@dude/sync';
import type { SyncCategory } from '@dude/sync';
import type { Db } from '@dude/sqlite-store';
import { getMeta, setMeta, transaction } from '@dude/sqlite-store';
import { commitEntity } from '../store/entity-commit.js';
import { getEnrollment } from '../store/repos/hub-enrollment.repo.js';
import { kvSyncEntity } from '../store/repos/kv.repo.js';
import { setStatusAll } from '../store/repos/outbox.repo.js';
import { insertConflict } from '../store/repos/sync-conflicts.repo.js';
import { getSyncState, updateSyncState } from '../store/repos/sync-state.repo.js';
import { dropOp, getOp, toAppliedChange } from './apply-remote.js';
import type { AppliedChange } from './apply-remote.js';
import { applyRemote, localSchemaVersion, readLocal, removeLocal, setBase } from './sync-entities.js';

export type { FirstSyncChoice, FirstSyncPreview } from '@dude/contracts';

/** The complete live Hub state, as a paged snapshot read in one go. */
export interface HubSnapshot {
  asOfRevision: number;
  floor: number;
  records: SyncRecord[];
}

export class FirstSyncError extends Error {
  constructor(readonly code: 'not-enrolled' | 'first-sync-done' | 'first-sync-stale' | 'confirmation-required' | 'no-backup-dir', message: string) { super(message); }
}

const PROGRESS_META = 'first_sync_progress';
const REBASE_META = 'sync_rebase_pending';
const STANDALONE_ENV_META = 'standalone_environment_id';
const NAME_SUFFIX = ' (this device)';

interface LocalItem { entityType: string; entityId: string; category: SyncCategory; payload: unknown; name: string | null }

const keyOf = (entityType: string, entityId: string): string => `${entityType}\u0000${entityId}`;
const nameOf = (payload: unknown): string | null =>
  typeof payload === 'object' && payload !== null && typeof (payload as { name?: unknown }).name === 'string' ? (payload as { name: string }).name : null;
const hashOf = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Every local entity a sync category covers: `records` rows plus the kv keys that journal as sync entities. */
function listLocalItems(db: Db): LocalItem[] {
  const items: LocalItem[] = [];
  const marks = SYNC_ENTITY_TYPES.map(() => '?').join(', ');
  const rows = db.prepare(`SELECT entity_type, entity_id, payload_json FROM records WHERE entity_type IN (${marks}) ORDER BY entity_type, entity_id`)
    .all(...SYNC_ENTITY_TYPES) as unknown as Array<{ entity_type: string; entity_id: string; payload_json: string }>;
  for (const r of rows) {
    const category = categoryOf(r.entity_type);
    if (!category) continue;
    const payload = JSON.parse(r.payload_json) as unknown;
    items.push({ entityType: r.entity_type, entityId: r.entity_id, category, payload, name: nameOf(payload) });
  }
  const kvRows = db.prepare('SELECT namespace, key, policy, scope FROM kv ORDER BY namespace, key').all() as unknown as Array<{ namespace: string; key: string; policy: string; scope: string }>;
  for (const r of kvRows) {
    const entity = kvSyncEntity(r.namespace, r.key, r.policy, r.scope);
    const category = entity ? categoryOf(entity.entityType) : undefined;
    if (!entity || !category) continue;
    const local = readLocal(db, entity.entityType, entity.entityId);
    if (local.exists) items.push({ ...entity, category, payload: local.payload, name: null });
  }
  return items;
}

/** Live Hub records this build understands (a newer-schema record is left for a later rebase after an update). */
function usableHubRecords(snapshot: HubSnapshot): SyncRecord[] {
  return snapshot.records.filter((r) => !r.deleted && r.payload !== null && categoryOf(r.entityType) !== undefined && r.schemaVersion <= localSchemaVersion(r.entityType));
}

const hubEnvironment = (db: Db): string => {
  const enrollment = getEnrollment(db);
  if (!enrollment) throw new FirstSyncError('not-enrolled', 'This device is not enrolled with a Hub.');
  return enrollment.environmentId;
};

function digestOf(environmentId: string, snapshot: HubSnapshot, local: readonly LocalItem[], hub: readonly SyncRecord[]): string {
  return hashOf([
    environmentId, snapshot.asOfRevision,
    local.map((i) => [i.entityType, i.entityId, hashOf(i.payload)]).sort(),
    hub.map((r) => [r.entityType, r.entityId, r.revision]).sort(),
  ]);
}

export interface FirstSyncPreviewResult {
  preview: FirstSyncPreview;
  /** True when a choice could replace local data (any category has local items), so the caller should issue a confirmation token. */
  needsConfirmation: boolean;
}

/** Compares this device with the Hub snapshot per category. Writes nothing. */
export function firstSyncPreview(db: Db, snapshot: HubSnapshot): FirstSyncPreviewResult {
  const environmentId = hubEnvironment(db);
  if (getSyncState(db).firstSyncState === 'done') throw new FirstSyncError('first-sync-done', 'The first sync already ran.');
  const local = listLocalItems(db);
  const hub = usableHubRecords(snapshot);
  const categories: FirstSyncCategoryPreview[] = SYNC_CATEGORIES.map((def) => {
    const mine = local.filter((i) => i.category === def.id);
    const theirs = hub.filter((r) => categoryOf(r.entityType) === def.id);
    const hubByKey = new Map(theirs.map((r) => [keyOf(r.entityType, r.entityId), r]));
    const mineByKey = new Map(mine.map((i) => [keyOf(i.entityType, i.entityId), i]));
    let identical = 0;
    let localOnly = 0;
    const different: FirstSyncCategoryPreview['sameIdDifferent'] = [];
    for (const item of mine) {
      const h = hubByKey.get(keyOf(item.entityType, item.entityId));
      if (!h) localOnly += 1;
      else if (deepEqual(item.payload, h.payload)) identical += 1;
      else different.push({ entityType: item.entityType, entityId: item.entityId, name: item.name ?? nameOf(h.payload) });
    }
    const hubOnly = theirs.filter((r) => !mineByKey.has(keyOf(r.entityType, r.entityId)));
    const collisions: FirstSyncCategoryPreview['sameNameDifferentId'] = [];
    for (const item of mine) {
      if (item.name === null || hubByKey.has(keyOf(item.entityType, item.entityId))) continue;
      for (const h of hubOnly) {
        if (h.entityType === item.entityType && nameOf(h.payload) === item.name) collisions.push({ entityType: item.entityType, name: item.name, localId: item.entityId, hubId: h.entityId });
      }
    }
    const what = def.label.toLowerCase();
    const disclosure = (localOnly + different.length === 0
      ? `Nothing from this device is sent for ${what}.`
      : `${localOnly + different.length} ${what} item${localOnly + different.length === 1 ? '' : 's'} from this device would be sent to your Hub.`)
      + (def.sensitivity === 'sensitive' ? ' This category may contain sensitive content.' : '');
    return {
      category: def.id, label: def.label, sensitivity: def.sensitivity, defaultEnabled: def.defaultEnabled,
      localCount: mine.length, hubCount: theirs.length, sameIdIdentical: identical, sameIdDifferent: different, sameNameDifferentId: collisions,
      localOnly, hubOnly: hubOnly.length, disclosure, recommended: def.defaultEnabled ? 'merge' : 'keep-local',
    };
  });
  return {
    preview: { asOfRevision: snapshot.asOfRevision, digest: digestOf(environmentId, snapshot, local, hub), categories, confirmToken: null, expiresAt: null },
    needsConfirmation: categories.some((c) => c.localCount > 0),
  };
}

export interface FirstSyncContext {
  now: () => Date;
  newOpId: () => string;
  deviceId: string;
  /** Where `use-hub` writes its recovery snapshot (`first-sync-<ts>.db`). */
  backupDir?: string;
  /** The caller validated a single-use confirmation token for this digest. */
  confirmed: boolean;
  /** Test seam: runs after each category committed (throw to simulate a crash). */
  afterCategory?: (category: SyncCategory) => void;
}

export interface FirstSyncResult {
  applied: AppliedChange[];
  conflicts: number;
  recoverySnapshot: string | null;
}

interface Progress { digest: string; choices: Record<SyncCategory, FirstSyncChoice>; asOfRevision: number; snapshotPath: string | null; done: SyncCategory[] }

function readProgress(db: Db): Progress | undefined {
  const raw = getMeta(db, PROGRESS_META);
  if (raw === undefined) return undefined;
  try { return JSON.parse(raw) as Progress; } catch { return undefined; }
}
const writeProgress = (db: Db, progress: Progress): void => setMeta(db, PROGRESS_META, JSON.stringify(progress));

function resolveChoices(given: Partial<Record<SyncCategory, FirstSyncChoice>>): Record<SyncCategory, FirstSyncChoice> {
  const out = {} as Record<SyncCategory, FirstSyncChoice>;
  for (const def of SYNC_CATEGORIES) out[def.id] = given[def.id] ?? (def.defaultEnabled ? 'merge' : 'keep-local');
  return out;
}

/** A full copy of the store, taken before anything local is replaced. */
export function takeRecoverySnapshot(db: Db, dir: string, now: Date, prefix = 'first-sync'): string {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${prefix}-${now.toISOString().replace(/[:.]/g, '-')}.db`);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  return file;
}

/** Inserts or updates the one pending op of an entity so the local version uploads, based on `basedOn`. */
function queueUpsert(db: Db, ctx: FirstSyncContext, environmentId: string, item: { entityType: string; entityId: string }, payload: unknown, basedOn: number | null): void {
  const stamp = ctx.now().toISOString();
  const existing = getOp(db, item.entityType, item.entityId);
  const record = db.prepare('SELECT local_revision FROM records WHERE entity_type = ? AND entity_id = ?').get(item.entityType, item.entityId) as { local_revision: number } | undefined;
  const localRevision = existing?.localRevision ?? record?.local_revision ?? 1;
  db.prepare(
    `INSERT INTO outbox(op_id, entity_type, entity_id, environment_id, device_id, op_kind, schema_version, based_on_revision, local_revision, payload_json, status, created_at, updated_at)
     VALUES(?, ?, ?, ?, ?, 'upsert', ?, ?, ?, ?, 'pending', ?, ?)
     ON CONFLICT(entity_type, entity_id) DO UPDATE SET
       op_id = excluded.op_id, environment_id = excluded.environment_id, device_id = excluded.device_id, op_kind = 'upsert',
       schema_version = excluded.schema_version, based_on_revision = excluded.based_on_revision, payload_json = excluded.payload_json,
       status = 'pending', reason = NULL, attempts = 0, last_attempt_at = NULL, updated_at = excluded.updated_at`,
  ).run(ctx.newOpId(), item.entityType, item.entityId, environmentId, ctx.deviceId, localSchemaVersion(item.entityType), basedOn, localRevision, JSON.stringify(payload), existing?.createdAt ?? stamp, stamp);
}

interface CategoryOutcome { applied: AppliedChange[]; conflicts: number }

function stepKeepLocal(): CategoryOutcome { return { applied: [], conflicts: 0 }; }

function stepUseHub(db: Db, category: SyncCategory, snapshot: HubSnapshot, ctx: FirstSyncContext, environmentId: string): CategoryOutcome {
  const out: CategoryOutcome = { applied: [], conflicts: 0 };
  const types = SYNC_ENTITY_TYPES.filter((t) => categoryOf(t) === category);
  for (const item of listLocalItems(db).filter((i) => i.category === category)) {
    removeLocal(db, item.entityType, item.entityId);
    out.applied.push(toAppliedChange(item.entityType, item.entityId, true, null));
  }
  if (types.length > 0) db.prepare(`DELETE FROM outbox WHERE entity_type IN (${types.map(() => '?').join(', ')})`).run(...types);
  for (const h of usableHubRecords(snapshot).filter((r) => categoryOf(r.entityType) === category)) {
    applyRemote(db, h, { environmentId, now: ctx.now });
    out.applied.push(toAppliedChange(h.entityType, h.entityId, false, h.payload));
  }
  return out;
}

function stepMerge(db: Db, category: SyncCategory, snapshot: HubSnapshot, ctx: FirstSyncContext, environmentId: string): CategoryOutcome {
  const out: CategoryOutcome = { applied: [], conflicts: 0 };
  const hub = usableHubRecords(snapshot).filter((r) => categoryOf(r.entityType) === category);
  const hubKeys = new Set(hub.map((r) => keyOf(r.entityType, r.entityId)));

  // Same name, different id: keep both, the local copy gets a suffix (journaled, so the rename uploads).
  const hubNames = new Set(hub.map((r) => `${r.entityType}\u0000${nameOf(r.payload) ?? ''}`));
  for (const item of listLocalItems(db).filter((i) => i.category === category)) {
    if (item.name === null || hubKeys.has(keyOf(item.entityType, item.entityId)) || !hubNames.has(`${item.entityType}\u0000${item.name}`)) continue;
    const payload = { ...(item.payload as Record<string, unknown>), name: `${item.name}${NAME_SUFFIX}` };
    const result = commitEntity(db, { deviceId: ctx.deviceId, environmentId, now: ctx.now, newOpId: ctx.newOpId }, { entityType: item.entityType, entityId: item.entityId, op: 'upsert', payload });
    if (result.ok) out.applied.push(toAppliedChange(item.entityType, item.entityId, false, payload));
  }

  const local = listLocalItems(db).filter((i) => i.category === category);
  const localByKey = new Map(local.map((i) => [keyOf(i.entityType, i.entityId), i]));
  const types = SYNC_ENTITY_TYPES.filter((t) => categoryOf(t) === category);

  for (const h of hub) {
    const mine = localByKey.get(keyOf(h.entityType, h.entityId));
    const op = getOp(db, h.entityType, h.entityId);
    if (!mine) {
      if (op) dropOp(db, op.opId);
      applyRemote(db, h, { environmentId, now: ctx.now });
      out.applied.push(toAppliedChange(h.entityType, h.entityId, false, h.payload));
      continue;
    }
    if (deepEqual(mine.payload, h.payload)) {
      setBase(db, h.entityType, h.entityId, h.revision, h.payload);
      if (op) dropOp(db, op.opId);
      continue;
    }
    const policy = syncPolicyFor(h.entityType);
    if (policy?.conflict === 'merge3') {
      const merged = merge3(null, mine.payload, h.payload, policy.fieldRules);
      if (merged.kind === 'merged') {
        applyRemote(db, { ...h, payload: merged.value }, { environmentId, now: ctx.now });
        setBase(db, h.entityType, h.entityId, h.revision, h.payload);
        queueUpsert(db, ctx, environmentId, h, merged.value, h.revision);
        out.applied.push(toAppliedChange(h.entityType, h.entityId, false, merged.value));
      } else {
        insertConflict(db, {
          entityType: h.entityType, entityId: h.entityId, kind: 'first-sync', localPayload: mine.payload, localDeleted: false, basePayload: null,
          remotePayload: h.payload, remoteDeleted: false, remoteRevision: h.revision, fields: merged.fields, detectedAt: ctx.now().toISOString(),
        });
        applyRemote(db, h, { environmentId, now: ctx.now });
        if (op) dropOp(db, op.opId);
        out.applied.push(toAppliedChange(h.entityType, h.entityId, false, h.payload));
        out.conflicts += 1;
      }
    } else {
      // lww and per-device: this device deliberately overwrites the Hub's value with its own.
      setBase(db, h.entityType, h.entityId, h.revision, h.payload);
      queueUpsert(db, ctx, environmentId, h, mine.payload, h.revision);
    }
  }

  // Local-only items upload; a stale delete op for an entity that now exists on the Hub (or nowhere) is meaningless.
  for (const item of local) {
    if (hubKeys.has(keyOf(item.entityType, item.entityId))) continue;
    queueUpsert(db, ctx, environmentId, item, readLocal(db, item.entityType, item.entityId).payload ?? item.payload, null);
  }
  if (types.length > 0) {
    db.prepare(`DELETE FROM outbox WHERE op_kind = 'delete' AND entity_type IN (${types.map(() => '?').join(', ')})`).run(...types);
  }
  return out;
}

/**
 * The first sync, in one resumable and idempotent flow. Per category: keep-local leaves the data alone (and disables the
 * category), use-hub replaces local items with the Hub's (after a recovery snapshot and a confirmation), merge combines
 * both. Each category commits in its own transaction and is recorded in `first_sync_progress`, so a crash resumes at the next
 * category. The final step re-keys records and ops to the Hub environment, applies the categories and the cursor, and marks the
 * first sync done; the caller then lets normal sync take over (it pushes the queued local-only ops).
 */
export function firstSyncApply(
  db: Db, input: { choices: Partial<Record<SyncCategory, FirstSyncChoice>>; digest: string }, snapshot: HubSnapshot, ctx: FirstSyncContext,
): FirstSyncResult {
  const environmentId = hubEnvironment(db);
  let progress = readProgress(db);
  if (progress && progress.digest !== input.digest) progress = undefined;
  if (!progress) {
    if (getSyncState(db).firstSyncState === 'done') throw new FirstSyncError('first-sync-done', 'The first sync already ran.');
    const current = digestOf(environmentId, snapshot, listLocalItems(db), usableHubRecords(snapshot));
    if (current !== input.digest) throw new FirstSyncError('first-sync-stale', 'This device or the Hub changed since the preview. Preview the first sync again.');
    const choices = resolveChoices(input.choices);
    const destructive = SYNC_CATEGORIES.some((c) => choices[c.id] === 'use-hub');
    if (destructive && !ctx.confirmed) throw new FirstSyncError('confirmation-required', 'Replacing this device\'s data with the Hub\'s needs the confirmation from the preview.');
    let snapshotPath: string | null = null;
    if (destructive) {
      if (!ctx.backupDir) throw new FirstSyncError('no-backup-dir', 'No place to keep a recovery snapshot.');
      snapshotPath = takeRecoverySnapshot(db, ctx.backupDir, ctx.now());
    }
    progress = { digest: input.digest, choices, asOfRevision: snapshot.asOfRevision, snapshotPath, done: [] };
    writeProgress(db, progress);
  }

  const result: FirstSyncResult = { applied: [], conflicts: 0, recoverySnapshot: progress.snapshotPath };
  for (const def of SYNC_CATEGORIES) {
    const category = def.id;
    if (progress.done.includes(category)) continue;
    const choice = progress.choices[category];
    const outcome = transaction(db, () => {
      const stepped = choice === 'use-hub' ? stepUseHub(db, category, snapshot, ctx, environmentId)
        : choice === 'merge' ? stepMerge(db, category, snapshot, ctx, environmentId)
          : stepKeepLocal();
      progress = { ...progress as Progress, done: [...(progress as Progress).done, category] };
      writeProgress(db, progress);
      return stepped;
    });
    result.applied.push(...outcome.applied);
    result.conflicts += outcome.conflicts;
    ctx.afterCategory?.(category);
  }

  const final = progress as Progress;
  transaction(db, () => {
    if (getMeta(db, STANDALONE_ENV_META) === undefined) setMeta(db, STANDALONE_ENV_META, getMeta(db, 'environment_id') ?? '');
    db.prepare('UPDATE records SET environment_id = ?').run(environmentId);
    db.prepare('UPDATE outbox SET environment_id = ?').run(environmentId);
    // Work queued while standalone (or stranded by an earlier revocation) now belongs to this Hub; disabled categories stay held.
    setStatusAll(db, ['unsent-standalone', 'stranded'], 'pending');
    const categories = {} as Record<SyncCategory, boolean>;
    for (const def of SYNC_CATEGORIES) categories[def.id] = final.choices[def.id] !== 'keep-local';
    updateSyncState(db, { categories, cursor: final.asOfRevision, floor: snapshot.floor, firstSyncState: 'done', firstSyncAt: ctx.now().toISOString() });
    db.prepare('DELETE FROM meta WHERE key IN (?, ?)').run(PROGRESS_META, REBASE_META);
  });
  return result;
}
