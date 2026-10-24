import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { getRow } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import {
  COLLAB_MAX_ROOMS, CollabRoom, CollabRoomParams, CollabRoomsResponse, CreateCollabRoomRequest, ErrorEnvelope, HUB_COLLAB_ROOMS_PATH,
  KeepCollabRoomRequest, KeepCollabRoomResponse, COLLAB_DOCUMENTS_LIST_MAX, CollabDocumentParams, CollabDocumentsResponse, HUB_COLLAB_DOCUMENTS_PATH, OkResponse,
} from '@dude/contracts/hub';
import { principalConsents } from '../../collab/collab-consent.js';
import type { CollabRooms } from '../../collab/rooms.js';
import { DeviceInactiveError, commitCanonical, getCanonicalRecord, listCanonicalRecords } from '../../db/canonical-repository.js';
import { audit } from '../../security/audit.js';
import { envelope } from '../errors.js';
import type { HubEvents } from '../../auth/hub-events.js';
import { createCollabCallers } from './collab-caller.js';
import type { Preparer } from './collab-caller.js';

export interface CollabRoomRouteOptions {
  db: Db;
  now: () => number;
  rooms: CollabRooms;
  hubEvents: HubEvents;
  requireOwner: Preparer;
  requireDevice: Preparer;
}

const ipOf = (request: FastifyRequest): string => request.ip || 'unknown';

/**
 * Markdown Workspace rooms on the Hub (PD-104). Credential types: owner cookie or bearer session, or a device token (a device
 * may host and join rooms, but a device credential gains no owner right anywhere else). A cookie POST carries the usual Origin
 * and CSRF checks (request guard). Rooms are ephemeral Hub memory: creating and listing are not audited; "keep" persists a room
 * as a `markdown-doc` record, only while `collab-documents` is on for the caller, and writes `collab.document-kept` (ids only,
 * never the title or body). The kept documents are listed (`GET /collab/documents`, not audited) and deleted (`DELETE
 * /collab/documents/:id`, a tombstone audited `collab.document-deleted` with ids only) by the same credentials, both only while
 * `collab-documents` is on for the caller.
 */
export function registerCollabRoomRoutes(app: FastifyInstance, options: CollabRoomRouteOptions): void {
  const { db, now, rooms } = options;
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const P = HUB_COLLAB_ROOMS_PATH;
  const nostore = (reply: FastifyReply): void => void reply.header('Cache-Control', 'no-store');
  const { requireCaller, callerOf } = createCollabCallers({ db, requireOwner: options.requireOwner, requireDevice: options.requireDevice });

  typed.get(
    P,
    { preHandler: requireCaller, schema: { response: { 200: CollabRoomsResponse, 401: ErrorEnvelope, 403: ErrorEnvelope } } },
    async (_request, reply) => {
      nostore(reply);
      return reply.code(200).send({ rooms: rooms.list() });
    },
  );

  typed.post(
    P,
    { preHandler: requireCaller, schema: { body: CreateCollabRoomRequest, response: { 201: CollabRoom, 400: ErrorEnvelope, 401: ErrorEnvelope, 403: ErrorEnvelope, 409: ErrorEnvelope } } },
    async (request, reply) => {
      nostore(reply);
      const created = rooms.create(request.body.name);
      if (!created.ok) return reply.code(409).send(envelope('conflict', `At most ${COLLAB_MAX_ROOMS} rooms can be open at once.`));
      return reply.code(201).send(created.room);
    },
  );

  typed.post(
    `${P}/:roomId/keep`,
    {
      preHandler: requireCaller,
      schema: {
        params: CollabRoomParams, body: KeepCollabRoomRequest,
        response: { 200: KeepCollabRoomResponse, 400: ErrorEnvelope, 401: ErrorEnvelope, 403: ErrorEnvelope, 404: ErrorEnvelope, 413: ErrorEnvelope, 409: ErrorEnvelope },
      },
    },
    async (request, reply) => {
      nostore(reply);
      const caller = callerOf(request);
      const at = now();
      if (!principalConsents(db, caller, 'collab-documents')) {
        audit(db, { event: 'collab.document-kept', outcome: 'denied', actorKind: caller.actorKind, actorId: caller.actorId, ip: ipOf(request), detail: { reason: 'consent-required' }, now: at });
        return reply.code(403).send(envelope('forbidden', 'Keeping a document on the Hub needs the Markdown documents sync category enabled.'));
      }
      const body = rooms.text(request.params.roomId);
      if (body === undefined) return reply.code(404).send(envelope('not-found', 'No such room.'));
      const environmentId = getRow<{ environment_id: string }>(db.prepare('SELECT environment_id FROM environment LIMIT 1'))?.environment_id;
      if (environmentId === undefined) return reply.code(404).send(envelope('not-found', 'No environment.'));
      const entityId = randomBytes(12).toString('base64url');
      const iso = new Date(at).toISOString();
      let result;
      try {
        result = commitCanonical(db, {
          environmentId, entityType: 'markdown-doc', entityId, op: 'upsert', now: iso, enforcePolicy: true, basedOnRevision: null, schemaVersion: 1,
          payload: { id: entityId, title: request.body.title, body, createdAt: iso, updatedAt: iso },
          deviceId: caller.rowId, ...(caller.rowId === null ? {} : { actingDeviceId: caller.rowId }), ...(caller.actor ? { actor: caller.actor } : {}),
        });
      } catch (error) {
        // The acting device or session ended between authentication and the commit: nothing was written.
        if (error instanceof DeviceInactiveError) return reply.code(401).send(envelope('unauthorized', 'Authentication is required.'));
        throw error;
      }
      if (result.status === 'rejected') return reply.code(413).send(envelope('payload-too-large', 'The room is too large to keep as a document.'));
      if (result.status === 'conflict') return reply.code(409).send(envelope('conflict', 'The document could not be created.'));
      audit(db, {
        event: 'collab.document-kept', outcome: 'success', actorKind: caller.actorKind, actorId: caller.actorId, ip: ipOf(request),
        detail: { entityId, ...(caller.rowId === null ? {} : { deviceId: caller.rowId }) }, now: at,
      });
      if (result.status === 'applied') options.hubEvents.emit('records-changed', { environmentId, revision: result.revision, originDeviceId: caller.rowId });
      return reply.code(200).send({ entityId });
    },
  );

  const environmentIdOf = (): string | undefined =>
    getRow<{ environment_id: string }>(db.prepare('SELECT environment_id FROM environment LIMIT 1'))?.environment_id;
  const CONSENT_MESSAGE = 'Kept documents need the Markdown documents sync category enabled.';

  // Kept documents (PD-104): the live markdown-doc records, newest first. Read-only: not audited.
  typed.get(
    HUB_COLLAB_DOCUMENTS_PATH,
    { preHandler: requireCaller, schema: { response: { 200: CollabDocumentsResponse, 401: ErrorEnvelope, 403: ErrorEnvelope } } },
    async (request, reply) => {
      nostore(reply);
      const caller = callerOf(request);
      if (!principalConsents(db, caller, 'collab-documents')) return reply.code(403).send(envelope('forbidden', CONSENT_MESSAGE));
      const environmentId = environmentIdOf();
      const records = environmentId === undefined ? [] : listCanonicalRecords(db, environmentId, 'markdown-doc');
      const documents = records
        .map((r) => r.payload as { id: string; title: string; body: string; updatedAt: string })
        .map((p) => ({ id: p.id, title: p.title, updatedAt: p.updatedAt, bytes: Buffer.byteLength(p.body, 'utf8') }))
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : a.id.localeCompare(b.id)))
        .slice(0, COLLAB_DOCUMENTS_LIST_MAX);
      return reply.code(200).send({ documents });
    },
  );

  // Deleting a kept document tombstones the record; the commit removes its collaborative state and ends its subscribers.
  typed.delete(
    `${HUB_COLLAB_DOCUMENTS_PATH}/:id`,
    { preHandler: requireCaller, schema: { params: CollabDocumentParams, response: { 200: OkResponse, 401: ErrorEnvelope, 403: ErrorEnvelope, 404: ErrorEnvelope } } },
    async (request, reply) => {
      nostore(reply);
      const caller = callerOf(request);
      const at = now();
      const entityId = request.params.id;
      if (!principalConsents(db, caller, 'collab-documents')) {
        audit(db, { event: 'collab.document-deleted', outcome: 'denied', actorKind: caller.actorKind, actorId: caller.actorId, ip: ipOf(request), detail: { reason: 'consent-required' }, now: at });
        return reply.code(403).send(envelope('forbidden', CONSENT_MESSAGE));
      }
      const environmentId = environmentIdOf();
      const existing = environmentId === undefined ? undefined : getCanonicalRecord(db, environmentId, 'markdown-doc', entityId);
      if (environmentId === undefined || existing === undefined || existing.deleted) return reply.code(404).send(envelope('not-found', 'No such document.'));
      let result;
      try {
        result = commitCanonical(db, {
          environmentId, entityType: 'markdown-doc', entityId, op: 'delete', now: new Date(at).toISOString(),
          deviceId: caller.rowId, ...(caller.rowId === null ? {} : { actingDeviceId: caller.rowId }), ...(caller.actor ? { actor: caller.actor } : {}),
        });
      } catch (error) {
        if (error instanceof DeviceInactiveError) return reply.code(401).send(envelope('unauthorized', 'Authentication is required.'));
        throw error;
      }
      audit(db, {
        event: 'collab.document-deleted', outcome: 'success', actorKind: caller.actorKind, actorId: caller.actorId, ip: ipOf(request),
        detail: { entityId, ...(caller.rowId === null ? {} : { deviceId: caller.rowId }) }, now: at,
      });
      if (result.status === 'applied') options.hubEvents.emit('records-changed', { environmentId, revision: result.revision, originDeviceId: caller.rowId });
      return reply.code(200).send({ ok: true });
    },
  );
}
