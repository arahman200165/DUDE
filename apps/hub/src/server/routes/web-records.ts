import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Type from 'typebox';
import type { Db } from '@dude/sqlite-store';
import {
  ErrorEnvelope, HUB_API_PREFIX, SYNC_CURSOR_EXPIRED, SyncChangesResponse, SyncPushRequest, SyncPushResponse, SyncSnapshotResponse, SyncStateReport,
  SyncStateResponse, WEB_NOT_ATTACHED, WEB_PATHS, WebAccessResponse, WebAccessSetRequest, WebAttachRequest, WebAttachResponse,
} from '@dude/contracts/hub';
import type { SyncOpResult } from '@dude/contracts/hub';
import { SYNC_LIMITS } from '@dude/sync';
import type { OwnerContext } from '../../auth/owner-auth.js';
import { DeviceInactiveError, commitCanonical, currentRevision } from '../../db/canonical-repository.js';
import type { SyncCommitResult } from '../../db/canonical-repository.js';
import { changesAfter, getRetentionDays, getSyncFloor, recordDeviceSyncState, snapshotPage } from '../../db/sync-repository.js';
import { categoryDisabled, entityVisible, getWebAccess, setWebAccess } from '../../db/web-access.js';
import { attachBrowser, boundBrowser } from '../../devices/browsers.js';
import type { BrowserBinding } from '../../devices/browsers.js';
import { audit } from '../../security/audit.js';
import { envelope } from '../errors.js';

type Preparer = (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | undefined>;

export interface WebRecordRouteOptions {
  db: Db;
  now: () => number;
  /** Owner cookie session only; CSRF for mutations is enforced by the request guard. */
  requireCookieOwner: Preparer;
}

const ChangesQueryString = Type.Object({
  after: Type.String({ pattern: '^(0|[1-9][0-9]{0,15})$' }),
  limit: Type.Optional(Type.String({ pattern: '^[1-9][0-9]{0,3}$' })),
});
const SnapshotQueryString = Type.Object({
  afterType: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
  afterId: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  limit: Type.Optional(Type.String({ pattern: '^[1-9][0-9]{0,3}$' })),
});
const MAX_PAGE = 1000;
const ipOf = (request: FastifyRequest): string => request.ip || 'unknown';

/**
 * Hub web record routes (Phase 31E, PD-050/PD-051): the signed-in browser reads and writes canonical records through an
 * owner cookie session plus its key-less browser row. Same commit path, policy enforcement and change feed as device
 * sync; a per-category web access toggle gates what the browser sees and may write. A browser row is attribution only.
 *
 * Audit: `attach` writes `web.attached` (device id only), `push` writes `sync.pushed` (counts and device id, never payloads),
 * `access` changes write `web.access-changed`. Reads and `state` are polled and not audited.
 */
export function registerWebRecordRoutes(app: FastifyInstance, options: WebRecordRouteOptions): void {
  const { db, now } = options;
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const P = HUB_API_PREFIX;
  const nostore = (reply: FastifyReply): void => void reply.header('Cache-Control', 'no-store');
  const iso = (): string => new Date(now()).toISOString();
  const ownerEnvironment = (): string | undefined =>
    (db.prepare('SELECT environment_id FROM environment LIMIT 1').get() as { environment_id: string } | undefined)?.environment_id;
  /** The browser row bound to the calling session, or null after sending the 409. */
  const attached = (request: FastifyRequest, reply: FastifyReply): BrowserBinding | null => {
    const binding = boundBrowser(db, (request.owner as OwnerContext).sessionHash, now());
    if (!binding) {
      void reply.code(409).send({ error: { code: WEB_NOT_ATTACHED, message: 'This browser is not attached to the Hub. Attach it first.' } });
      return null;
    }
    return binding;
  };

  typed.post(
    `${P}${WEB_PATHS.attach}`,
    {
      preHandler: options.requireCookieOwner,
      schema: { body: WebAttachRequest, response: { 200: WebAttachResponse, 400: ErrorEnvelope, 401: ErrorEnvelope, 403: ErrorEnvelope, 404: ErrorEnvelope } },
    },
    async (request, reply) => {
      nostore(reply);
      const ctx = request.owner as OwnerContext;
      if (request.body.label.trim().length === 0) return reply.code(400).send(envelope('bad-request', 'The label cannot be empty.'));
      const result = attachBrowser(db, { installationId: request.body.installationId, label: request.body.label, sessionHash: ctx.sessionHash, now: now() });
      if (result.status === 'no-environment') return reply.code(404).send(envelope('not-found', 'No environment.'));
      const { binding } = result;
      audit(db, { event: 'web.attached', outcome: 'success', actorKind: 'owner', actorId: ctx.ownerId, ip: ipOf(request), detail: { deviceId: binding.deviceId }, now: now() });
      app.hubEvents.emit('device-registry-changed', { deviceId: binding.deviceId, change: 'updated' });
      return reply.code(200).send({
        deviceId: binding.deviceId, label: binding.displayName, access: getWebAccess(db, binding.environmentId),
        headRevision: currentRevision(db), floor: getSyncFloor(db), retentionDays: getRetentionDays(db),
      });
    },
  );

  typed.get(
    `${P}${WEB_PATHS.snapshot}`,
    {
      preHandler: options.requireCookieOwner,
      schema: { querystring: SnapshotQueryString, response: { 200: SyncSnapshotResponse, 400: ErrorEnvelope, 401: ErrorEnvelope, 403: ErrorEnvelope, 409: ErrorEnvelope } },
    },
    async (request, reply) => {
      nostore(reply);
      const browser = attached(request, reply);
      if (!browser) return reply;
      const { afterType, afterId } = request.query;
      const limit = Math.min(MAX_PAGE, request.query.limit !== undefined ? Number(request.query.limit) : SYNC_LIMITS.snapshotPage);
      const access = getWebAccess(db, browser.environmentId);
      const asOfRevision = currentRevision(db);
      const { records, next } = snapshotPage(db, browser.environmentId, afterType, afterId, limit);
      // The page boundary (`next`) comes from the unfiltered page, so a page of hidden categories still advances.
      return reply.code(200).send({ records: records.filter((r) => entityVisible(access, r.entityType)), asOfRevision, next, floor: getSyncFloor(db) });
    },
  );

  typed.get(
    `${P}${WEB_PATHS.changes}`,
    {
      preHandler: options.requireCookieOwner,
      schema: { querystring: ChangesQueryString, response: { 200: SyncChangesResponse, 400: ErrorEnvelope, 401: ErrorEnvelope, 403: ErrorEnvelope, 409: ErrorEnvelope, 410: ErrorEnvelope } },
    },
    async (request, reply) => {
      nostore(reply);
      const browser = attached(request, reply);
      if (!browser) return reply;
      const after = Number(request.query.after);
      const floor = getSyncFloor(db);
      if (floor > 0 && after < floor) {
        return reply.code(410).send({ error: { code: SYNC_CURSOR_EXPIRED, message: 'The cursor is older than the retained history; take a snapshot.' } });
      }
      const limit = Math.min(MAX_PAGE, request.query.limit !== undefined ? Number(request.query.limit) : SYNC_LIMITS.changesPage);
      const access = getWebAccess(db, browser.environmentId);
      const { changes, hasMore } = changesAfter(db, browser.environmentId, after, limit);
      const headRevision = currentRevision(db);
      const last = changes[changes.length - 1];
      // The cursor follows the unfiltered page so hidden categories never stall paging.
      const cursor = hasMore && last ? last.revision : headRevision;
      recordDeviceSyncState(db, browser.deviceId, null, iso(), { pull: true, cursor });
      return reply.code(200).send({ changes: changes.filter((c) => entityVisible(access, c.entityType)), cursor, hasMore, floor, headRevision });
    },
  );

  typed.post(
    `${P}${WEB_PATHS.push}`,
    {
      preHandler: options.requireCookieOwner,
      bodyLimit: SYNC_LIMITS.maxPushBytes,
      schema: { body: SyncPushRequest, response: { 200: SyncPushResponse, 400: ErrorEnvelope, 401: ErrorEnvelope, 403: ErrorEnvelope, 409: ErrorEnvelope, 413: ErrorEnvelope } },
    },
    async (request, reply) => {
      nostore(reply);
      const ctx = request.owner as OwnerContext;
      const browser = attached(request, reply);
      if (!browser) return reply;
      const access = getWebAccess(db, browser.environmentId);
      const at = iso();
      const counts = { applied: 0, duplicate: 0, conflict: 0, rejected: 0 };
      const results: SyncOpResult[] = [];
      let lastRevision = 0;
      for (const op of request.body.ops) {
        if (categoryDisabled(access, op.entityType)) {
          counts.rejected += 1;
          results.push({ opId: op.opId, status: 'rejected', reason: 'category-disabled' });
          continue;
        }
        let r: SyncCommitResult;
        try {
          r = commitCanonical(db, {
            environmentId: browser.environmentId, entityType: op.entityType, entityId: op.entityId, op: op.opKind, payload: op.payload, opId: op.opId,
            deviceId: browser.deviceId, now: at, enforcePolicy: true, basedOnRevision: op.basedOnRevision, actingDeviceId: browser.deviceId, schemaVersion: op.schemaVersion,
            actor: { kind: 'browser', deviceId: browser.deviceId, sessionHash: ctx.sessionHash },
          });
        } catch (error) {
          if (error instanceof DeviceInactiveError) return reply.code(401).send(envelope('unauthorized', 'Authentication is required.'));
          throw error;
        }
        counts[r.status] += 1;
        if (r.status === 'applied') lastRevision = r.revision;
        results.push(r.status === 'conflict' ? { opId: op.opId, status: 'conflict', current: r.current }
          : r.status === 'rejected' ? { opId: op.opId, status: 'rejected', reason: r.reason }
            : { opId: op.opId, status: r.status, revision: r.revision });
      }
      recordDeviceSyncState(db, browser.deviceId, null, at, { push: true });
      audit(db, {
        event: 'sync.pushed', outcome: 'success', actorKind: 'owner', actorId: ctx.ownerId, ip: ipOf(request),
        detail: { ...counts, deviceId: browser.deviceId }, now: now(),
      });
      if (counts.applied > 0) app.hubEvents.emit('records-changed', { environmentId: browser.environmentId, revision: lastRevision, originDeviceId: browser.deviceId });
      return reply.code(200).send({ results, headRevision: currentRevision(db) });
    },
  );

  typed.put(
    `${P}${WEB_PATHS.state}`,
    {
      preHandler: options.requireCookieOwner,
      schema: { body: SyncStateReport, response: { 200: SyncStateResponse, 400: ErrorEnvelope, 401: ErrorEnvelope, 403: ErrorEnvelope, 409: ErrorEnvelope } },
    },
    async (request, reply) => {
      nostore(reply);
      const browser = attached(request, reply);
      if (!browser) return reply;
      recordDeviceSyncState(db, browser.deviceId, request.body, iso());
      return reply.code(200).send({ floor: getSyncFloor(db), headRevision: currentRevision(db), retentionDays: getRetentionDays(db) });
    },
  );

  typed.get(
    `${P}${WEB_PATHS.access}`,
    { preHandler: options.requireCookieOwner, schema: { response: { 200: WebAccessResponse, 401: ErrorEnvelope, 403: ErrorEnvelope, 404: ErrorEnvelope } } },
    async (_request, reply) => {
      nostore(reply);
      const environmentId = ownerEnvironment();
      if (!environmentId) return reply.code(404).send(envelope('not-found', 'No environment.'));
      return reply.code(200).send({ access: getWebAccess(db, environmentId) });
    },
  );

  typed.put(
    `${P}${WEB_PATHS.access}`,
    {
      preHandler: options.requireCookieOwner,
      schema: { body: WebAccessSetRequest, response: { 200: WebAccessResponse, 400: ErrorEnvelope, 401: ErrorEnvelope, 403: ErrorEnvelope, 404: ErrorEnvelope } },
    },
    async (request, reply) => {
      nostore(reply);
      const ctx = request.owner as OwnerContext;
      const environmentId = ownerEnvironment();
      if (!environmentId) return reply.code(404).send(envelope('not-found', 'No environment.'));
      const { category, enabled } = request.body;
      setWebAccess(db, environmentId, category, enabled, iso());
      audit(db, { event: 'web.access-changed', outcome: 'success', actorKind: 'owner', actorId: ctx.ownerId, ip: ipOf(request), detail: { category, enabled }, now: now() });
      app.hubEvents.emit('web-access-changed', { environmentId });
      return reply.code(200).send({ access: getWebAccess(db, environmentId) });
    },
  );
}
