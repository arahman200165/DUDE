import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { Db } from '@dude/sqlite-store';
import { parseCollabDocKey } from '@dude/collab-doc';
import {
  CollabHistoryQuery, CollabHistoryResponse, CollabRestoreResponse, CollabSnapshotParams, CollabSnapshotResponse, ErrorEnvelope, HUB_COLLAB_HISTORY_PATH,
} from '@dude/contracts/hub';
import { collabCategory, principalConsents } from '../../collab/collab-consent.js';
import type { CollabRegistry } from '../../collab/doc-registry.js';
import { restoreCollabSnapshot } from '../../collab/history.js';
import { audit } from '../../security/audit.js';
import { envelope } from '../errors.js';
import { createCollabCallers } from './collab-caller.js';
import type { CollabCaller, Preparer } from './collab-caller.js';

export interface CollabHistoryRouteOptions {
  db: Db;
  now: () => number;
  registry: CollabRegistry;
  requireOwner: Preparer;
  requireDevice: Preparer;
}

const ipOf = (request: FastifyRequest): string => request.ip || 'unknown';
const CONSENT_MESSAGE = 'Document history needs the document\'s sync category enabled.';

/**
 * Document history (PD-105). Credential types: owner cookie or bearer session, or a device token (a device gains no owner right
 * elsewhere); every route needs the document's sync category on for the caller (PD-103). Listing and previewing are read-only and not
 * audited. A restore (a cookie POST carries the request guard's Origin and CSRF checks) snapshots the current state, is applied as a
 * forward edit attributed to the caller, writes the record at once and is audited `collab.history-restored` with the document key and
 * snapshot id only, never content. A room key is refused by the schema (rooms have no history); an unknown snapshot is 404.
 */
export function registerCollabHistoryRoutes(app: FastifyInstance, options: CollabHistoryRouteOptions): void {
  const { db, now, registry } = options;
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const P = HUB_COLLAB_HISTORY_PATH;
  const nostore = (reply: FastifyReply): void => void reply.header('Cache-Control', 'no-store');
  const { requireCaller, callerOf } = createCollabCallers({ db, requireOwner: options.requireOwner, requireDevice: options.requireDevice });

  /** Whether the caller has consented to the category of the document `docKey`; a room or a malformed key never has history. */
  const consents = (caller: CollabCaller, docKey: string): boolean => {
    const ref = parseCollabDocKey(docKey);
    const category = ref === null ? null : collabCategory(ref.kind);
    return category !== null && principalConsents(db, caller, category);
  };

  typed.get(
    P,
    { preHandler: requireCaller, schema: { querystring: CollabHistoryQuery, response: { 200: CollabHistoryResponse, 400: ErrorEnvelope, 401: ErrorEnvelope, 403: ErrorEnvelope } } },
    async (request, reply) => {
      nostore(reply);
      if (!consents(callerOf(request), request.query.doc)) return reply.code(403).send(envelope('forbidden', CONSENT_MESSAGE));
      return reply.code(200).send({ snapshots: registry.history.list(request.query.doc) });
    },
  );

  typed.get(
    `${P}/:snapshotId`,
    { preHandler: requireCaller, schema: { params: CollabSnapshotParams, response: { 200: CollabSnapshotResponse, 400: ErrorEnvelope, 401: ErrorEnvelope, 403: ErrorEnvelope, 404: ErrorEnvelope } } },
    async (request, reply) => {
      nostore(reply);
      const snapshot = registry.history.get(request.params.snapshotId);
      if (!snapshot) return reply.code(404).send(envelope('not-found', 'No such snapshot.'));
      if (!consents(callerOf(request), snapshot.docKey)) return reply.code(403).send(envelope('forbidden', CONSENT_MESSAGE));
      return reply.code(200).send({ doc: snapshot.docKey, takenAt: snapshot.takenAt, payload: snapshot.payload });
    },
  );

  typed.post(
    `${P}/:snapshotId/restore`,
    {
      preHandler: requireCaller,
      schema: {
        params: CollabSnapshotParams,
        response: { 200: CollabRestoreResponse, 400: ErrorEnvelope, 401: ErrorEnvelope, 403: ErrorEnvelope, 404: ErrorEnvelope, 409: ErrorEnvelope, 413: ErrorEnvelope },
      },
    },
    async (request, reply) => {
      nostore(reply);
      const caller = callerOf(request);
      const snapshotId = request.params.snapshotId;
      const at = now();
      const snapshot = registry.history.get(snapshotId);
      if (!snapshot) return reply.code(404).send(envelope('not-found', 'No such snapshot.'));
      if (!consents(caller, snapshot.docKey)) {
        audit(db, {
          event: 'collab.history-restored', outcome: 'denied', actorKind: caller.actorKind, actorId: caller.actorId, ip: ipOf(request),
          detail: { reason: 'consent-required', doc: snapshot.docKey, snapshotId }, now: at,
        });
        return reply.code(403).send(envelope('forbidden', CONSENT_MESSAGE));
      }
      const restored = restoreCollabSnapshot(registry, snapshotId, { deviceId: caller.rowId });
      if (!restored.ok) {
        if (restored.code === 'not-found') return reply.code(404).send(envelope('not-found', 'No such snapshot.'));
        if (restored.code === 'too-large') return reply.code(413).send(envelope('payload-too-large', 'The restored document would exceed the record size cap.'));
        return reply.code(409).send(envelope('conflict', 'The document was closed while it was being restored.'));
      }
      audit(db, {
        event: 'collab.history-restored', outcome: 'success', actorKind: caller.actorKind, actorId: caller.actorId, ip: ipOf(request),
        detail: { doc: restored.docKey, snapshotId, ...(caller.rowId === null ? {} : { deviceId: caller.rowId }) }, now: at,
      });
      return reply.code(200).send({ ok: true });
    },
  );
}
