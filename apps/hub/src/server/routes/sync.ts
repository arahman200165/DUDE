import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { Db } from '@dude/sqlite-store';
import { allRows, getRow, transaction } from '@dude/sqlite-store';
import {
  ErrorEnvelope, HUB_API_PREFIX, SYNC_CURSOR_EXPIRED, SYNC_PATHS, SyncChangesResponse, SyncClearPreview, SyncClearRequest, SyncClearResponse,
  SyncPushRequest, SyncPushResponse, SyncSnapshotResponse, SyncStateReport, SyncStateResponse, SyncSummary,
  SyncChangesQueryString, SyncSnapshotQueryString, parseSyncCategoriesQuery,
} from '@dude/contracts/hub';
import type { SyncOpResult } from '@dude/contracts/hub';
import { SYNC_LIMITS } from '@dude/sync';
import type { OwnerContext } from '../../auth/owner-auth.js';
import { DeviceInactiveError, commitCanonical, currentRevision } from '../../db/canonical-repository.js';
import type { SyncCommitResult } from '../../db/canonical-repository.js';
import {
  changesAfter, countLiveRecordsByCategory, getRetentionDays, getSyncFloor, listDeviceSyncState, recordDeviceSyncState, snapshotPage,
} from '../../db/sync-repository.js';
import { getAuthorityEpoch } from '../../hub/authority.js';
import { audit } from '../../security/audit.js';
import { ConfirmationStore } from '../../security/confirmation-store.js';
import { envelope } from '../errors.js';

type Preparer = (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | undefined>;

export interface SyncRouteOptions {
  db: Db;
  now: () => number;
  confirmations: ConfirmationStore;
  requireOwner: Preparer;
  requireDevice: Preparer;
}

export const CLEAR_ENVIRONMENT_ACTION = 'sync.environment-clear';

const MAX_PAGE = 1000;
const sha256Hex = (value: string): string => createHash('sha256').update(value).digest('hex');
const ipOf = (request: FastifyRequest): string => request.ip || 'unknown';

/**
 * Synchronization routes (Phase 31D). Credentials: device token for push/changes/snapshot/state (an owner credential
 * is refused 403 by `requireDevice`); owner cookie or bearer session for summary and the environment clear.
 *
 * Audit policy (follows the existing convention that read-only routes are not audited): `push` writes `sync.pushed`
 * with counts only; `snapshot` writes `sync.snapshot` for the first page only; `changes` and `state` are polled
 * constantly and are not audited (their effect is visible in the summary). Payloads are never audited.
 */
export function registerSyncRoutes(app: FastifyInstance, options: SyncRouteOptions): void {
  const { db, now } = options;
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const P = HUB_API_PREFIX;
  const nostore = (reply: FastifyReply): void => void reply.header('Cache-Control', 'no-store');
  const iso = (): string => new Date(now()).toISOString();
  const environmentOf = (deviceId: string): string | undefined =>
    getRow<{ environment_id: string }>(db.prepare('SELECT environment_id FROM devices WHERE device_id = ?'), deviceId)?.environment_id;
  const ownerEnvironment = (): string | undefined =>
    getRow<{ environment_id: string }>(db.prepare('SELECT environment_id FROM environment LIMIT 1'))?.environment_id;
  const unauthorized = (reply: FastifyReply): FastifyReply => reply.code(401).send(envelope('unauthorized', 'Device authentication is required.'));

  // --- Device --------------------------------------------------------------------------------------------------

  typed.post(
    `${P}${SYNC_PATHS.push}`,
    {
      preHandler: options.requireDevice,
      bodyLimit: SYNC_LIMITS.maxPushBytes,
      schema: { body: SyncPushRequest, response: { 200: SyncPushResponse, 400: ErrorEnvelope, 401: ErrorEnvelope, 403: ErrorEnvelope, 413: ErrorEnvelope } },
    },
    async (request, reply) => {
      nostore(reply);
      const deviceId = request.device!.deviceId;
      const environmentId = environmentOf(deviceId);
      if (!environmentId) return unauthorized(reply);
      const at = iso();
      const counts = { applied: 0, duplicate: 0, conflict: 0, rejected: 0 };
      const results: SyncOpResult[] = [];
      let lastRevision = 0;
      // Each op commits in its own transaction: a rejected or conflicting op never rolls back the others.
      for (const op of request.body.ops) {
        let r: SyncCommitResult;
        try {
          r = commitCanonical(db, {
            environmentId, entityType: op.entityType, entityId: op.entityId, op: op.opKind, payload: op.payload, opId: op.opId, deviceId,
            now: at, enforcePolicy: true, basedOnRevision: op.basedOnRevision, actingDeviceId: deviceId, schemaVersion: op.schemaVersion,
            actor: { kind: 'device', deviceId, keyId: request.device!.keyId },
          });
        } catch (error) {
          // Revoked between authentication and this commit: nothing of this op was written; the response matches any revoked credential.
          if (error instanceof DeviceInactiveError) return unauthorized(reply);
          throw error;
        }
        counts[r.status] += 1;
        if (r.status === 'applied') lastRevision = r.revision;
        results.push(r.status === 'conflict' ? { opId: op.opId, status: 'conflict', current: r.current }
          : r.status === 'rejected' ? { opId: op.opId, status: 'rejected', reason: r.reason }
            : { opId: op.opId, status: r.status, revision: r.revision });
      }
      recordDeviceSyncState(db, deviceId, null, at, { push: true });
      audit(db, { event: 'sync.pushed', outcome: 'success', actorKind: 'device', actorId: deviceId, ip: ipOf(request), detail: { ...counts }, now: now() });
      const headRevision = currentRevision(db);
      if (counts.applied > 0) app.hubEvents.emit('records-changed', { environmentId, revision: lastRevision, originDeviceId: deviceId });
      return reply.code(200).send({ results, headRevision });
    },
  );

  typed.get(
    `${P}${SYNC_PATHS.changes}`,
    {
      preHandler: options.requireDevice,
      schema: { querystring: SyncChangesQueryString, response: { 200: SyncChangesResponse, 400: ErrorEnvelope, 401: ErrorEnvelope, 403: ErrorEnvelope, 410: ErrorEnvelope } },
    },
    async (request, reply) => {
      nostore(reply);
      const deviceId = request.device!.deviceId;
      const environmentId = environmentOf(deviceId);
      if (!environmentId) return unauthorized(reply);
      const after = Number(request.query.after);
      const floor = getSyncFloor(db);
      if (floor > 0 && after < floor) {
        return reply.code(410).send({ error: { code: SYNC_CURSOR_EXPIRED, message: 'The cursor is older than the retained history; take a snapshot.' } });
      }
      const limit = Math.min(MAX_PAGE, request.query.limit !== undefined ? Number(request.query.limit) : SYNC_LIMITS.changesPage);
      const { changes, hasMore } = changesAfter(db, environmentId, after, limit, parseSyncCategoriesQuery(request.query.categories));
      const headRevision = currentRevision(db);
      const last = changes[changes.length - 1];
      const cursor = hasMore && last ? last.revision : headRevision;
      recordDeviceSyncState(db, deviceId, null, iso(), { pull: true, cursor });
      return reply.code(200).send({ changes, cursor, hasMore, floor, headRevision, authorityEpoch: getAuthorityEpoch(db) });
    },
  );

  typed.get(
    `${P}${SYNC_PATHS.snapshot}`,
    {
      preHandler: options.requireDevice,
      schema: { querystring: SyncSnapshotQueryString, response: { 200: SyncSnapshotResponse, 400: ErrorEnvelope, 401: ErrorEnvelope, 403: ErrorEnvelope } },
    },
    async (request, reply) => {
      nostore(reply);
      const deviceId = request.device!.deviceId;
      const environmentId = environmentOf(deviceId);
      if (!environmentId) return unauthorized(reply);
      const { afterType, afterId } = request.query;
      const limit = Math.min(MAX_PAGE, request.query.limit !== undefined ? Number(request.query.limit) : SYNC_LIMITS.snapshotPage);
      const asOfRevision = currentRevision(db);
      const { records, next } = snapshotPage(db, environmentId, afterType, afterId, limit, parseSyncCategoriesQuery(request.query.categories));
      if (afterType === undefined) {
        audit(db, { event: 'sync.snapshot', outcome: 'success', actorKind: 'device', actorId: deviceId, ip: ipOf(request), detail: { records: records.length }, now: now() });
      }
      return reply.code(200).send({ records, asOfRevision, next, floor: getSyncFloor(db), authorityEpoch: getAuthorityEpoch(db) });
    },
  );

  typed.put(
    `${P}${SYNC_PATHS.state}`,
    {
      preHandler: options.requireDevice,
      schema: { body: SyncStateReport, response: { 200: SyncStateResponse, 400: ErrorEnvelope, 401: ErrorEnvelope, 403: ErrorEnvelope } },
    },
    async (request, reply) => {
      nostore(reply);
      const deviceId = request.device!.deviceId;
      recordDeviceSyncState(db, deviceId, request.body, iso());
      return reply.code(200).send({ floor: getSyncFloor(db), headRevision: currentRevision(db), retentionDays: getRetentionDays(db), authorityEpoch: getAuthorityEpoch(db) });
    },
  );

  // --- Owner ---------------------------------------------------------------------------------------------------

  typed.get(
    `${P}${SYNC_PATHS.summary}`,
    { preHandler: options.requireOwner, schema: { response: { 200: SyncSummary, 401: ErrorEnvelope, 403: ErrorEnvelope } } },
    async (_request, reply) => {
      nostore(reply);
      const environmentId = ownerEnvironment();
      const headRevision = currentRevision(db);
      const active = new Map(allRows<{ device_id: string; kind: 'desktop' | 'browser' }>(
        db.prepare('SELECT device_id, kind FROM devices WHERE revoked_at IS NULL AND unenrolled_at IS NULL')).map((r) => [r.device_id, r.kind] as const));
      const devices = listDeviceSyncState(db).filter((d) => active.has(d.deviceId)).map((d) => ({
        deviceId: d.deviceId, kind: active.get(d.deviceId) ?? 'desktop', paused: d.reported?.paused ?? false,
        cursor: d.cursor, lag: Math.max(0, headRevision - d.cursor), lastPushAt: d.lastPushAt, lastPullAt: d.lastPullAt,
        quarantined: d.reported?.quarantined ?? 0, conflicts: d.reported?.conflicts ?? 0, pending: d.reported?.pending ?? 0,
      }));
      return reply.code(200).send({
        floor: getSyncFloor(db), headRevision, retentionDays: getRetentionDays(db),
        counts: countLiveRecordsByCategory(db, environmentId ?? ''), devices,
      });
    },
  );

  const liveCount = (environmentId: string): number =>
    getRow<{ n: number }>(db.prepare('SELECT COUNT(*) AS n FROM records WHERE environment_id = ? AND deleted = 0'), environmentId)?.n ?? 0;
  const clearDigest = (environmentId: string): string => sha256Hex(`${environmentId}\n${liveCount(environmentId)}\n${currentRevision(db)}`);

  typed.post(
    `${P}${SYNC_PATHS.clearPreview}`,
    { preHandler: options.requireOwner, schema: { response: { 200: SyncClearPreview, 401: ErrorEnvelope, 403: ErrorEnvelope, 404: ErrorEnvelope } } },
    async (request, reply) => {
      nostore(reply);
      const ctx = request.owner as OwnerContext;
      const environmentId = ownerEnvironment();
      if (!environmentId) return reply.code(404).send(envelope('not-found', 'No environment.'));
      const at = now();
      const confirmationId = options.confirmations.issue({ action: CLEAR_ENVIRONMENT_ACTION, digest: clearDigest(environmentId), bindingId: ctx.sessionHash, now: at });
      const recordCount = liveCount(environmentId);
      const deviceCount = getRow<{ n: number }>(
        db.prepare('SELECT COUNT(*) AS n FROM devices WHERE environment_id = ? AND revoked_at IS NULL AND unenrolled_at IS NULL'), environmentId)?.n ?? 0;
      audit(db, { event: 'sync.environment-clear-previewed', outcome: 'success', actorKind: 'owner', actorId: ctx.ownerId, ip: ipOf(request), detail: { recordCount, deviceCount }, now: at });
      return reply.code(200).send({ confirmationId, recordCount, deviceCount, expiresAt: ConfirmationStore.expiresAt(at) });
    },
  );

  typed.post(
    `${P}${SYNC_PATHS.clear}`,
    {
      preHandler: options.requireOwner,
      schema: { body: SyncClearRequest, response: { 200: SyncClearResponse, 400: ErrorEnvelope, 401: ErrorEnvelope, 403: ErrorEnvelope, 404: ErrorEnvelope, 409: ErrorEnvelope } },
    },
    async (request, reply) => {
      nostore(reply);
      const ctx = request.owner as OwnerContext;
      const environmentId = ownerEnvironment();
      if (!environmentId) return reply.code(404).send(envelope('not-found', 'No environment.'));
      const result = options.confirmations.consumeDetailed({
        token: request.body.confirmationId, action: CLEAR_ENVIRONMENT_ACTION, digest: clearDigest(environmentId), bindingId: ctx.sessionHash, now: now(),
      });
      if (result === 'invalid') return reply.code(403).send(envelope('forbidden', 'The confirmation is missing, expired or already used.'));
      if (result === 'digest-mismatch') return reply.code(409).send(envelope('conflict', 'The synchronized data changed since the preview.'));
      const at = iso();
      // Normal deletes with change-feed entries (no policy), so every device deletes through its ordinary changes pull.
      const deleted = transaction(db, () => {
        const rows = allRows<{ entity_type: string; entity_id: string }>(
          db.prepare('SELECT entity_type, entity_id FROM records WHERE environment_id = ? AND deleted = 0 ORDER BY entity_type, entity_id'), environmentId);
        for (const row of rows) {
          commitCanonical(db, { environmentId, entityType: row.entity_type, entityId: row.entity_id, op: 'delete', deviceId: null, now: at });
        }
        return rows.length;
      });
      const headRevision = currentRevision(db);
      audit(db, { event: 'sync.environment-cleared', outcome: 'success', actorKind: 'owner', actorId: ctx.ownerId, ip: ipOf(request), detail: { deleted }, now: now() });
      if (deleted > 0) app.hubEvents.emit('records-changed', { environmentId, revision: headRevision, originDeviceId: null });
      return reply.code(200).send({ deleted, headRevision });
    },
  );
}
