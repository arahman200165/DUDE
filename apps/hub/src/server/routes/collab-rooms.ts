import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { getRow } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import {
  COLLAB_MAX_ROOMS, CollabRoom, CollabRoomParams, CollabRoomsResponse, CreateCollabRoomRequest, ErrorEnvelope, HUB_COLLAB_ROOMS_PATH,
  KeepCollabRoomRequest, KeepCollabRoomResponse,
} from '@dude/contracts/hub';
import type { OwnerContext } from '../../auth/owner-auth.js';
import { principalConsents } from '../../collab/collab-consent.js';
import type { CollabRooms } from '../../collab/rooms.js';
import { DeviceInactiveError, commitCanonical } from '../../db/canonical-repository.js';
import type { CommitActor } from '../../db/canonical-repository.js';
import { boundBrowser } from '../../devices/browsers.js';
import { DEVICE_TOKEN_PREFIX } from '../../devices/device-tokens.js';
import { audit } from '../../security/audit.js';
import { classifyCredential } from '../../security/request-guard.js';
import { envelope } from '../errors.js';
import type { HubEvents } from '../../auth/hub-events.js';

type Preparer = (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | undefined>;

export interface CollabRoomRouteOptions {
  db: Db;
  now: () => number;
  rooms: CollabRooms;
  hubEvents: HubEvents;
  requireOwner: Preparer;
  requireDevice: Preparer;
}

const ipOf = (request: FastifyRequest): string => request.ip || 'unknown';

/** The authenticated caller of a room route, whichever credential it presented. */
interface Caller {
  kind: 'owner-cookie' | 'owner-bearer' | 'device';
  /** Audit actor: the owner, or the device. */
  actorKind: 'owner' | 'device';
  actorId: string;
  /** The registry row the work is attributed to (a device, a bound owner-bearer's device, or the cookie session's attached browser row). */
  rowId: string | null;
  deviceId: string | null;
  boundDeviceId: string | null;
  actor: CommitActor | undefined;
}

/**
 * Markdown Workspace rooms on the Hub (PD-104). Credential types: owner cookie or bearer session, or a device token (a device
 * may host and join rooms, but a device credential gains no owner right anywhere else). A cookie POST carries the usual Origin
 * and CSRF checks (request guard). Rooms are ephemeral Hub memory: creating and listing are not audited; "keep" persists a room
 * as a `markdown-doc` record, only while `collab-documents` is on for the caller, and writes `collab.document-kept` (ids only,
 * never the title or body).
 */
export function registerCollabRoomRoutes(app: FastifyInstance, options: CollabRoomRouteOptions): void {
  const { db, now, rooms } = options;
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const P = HUB_COLLAB_ROOMS_PATH;
  const nostore = (reply: FastifyReply): void => void reply.header('Cache-Control', 'no-store');
  const callers = new WeakMap<FastifyRequest, Caller>();

  const requireCaller: Preparer = async (request, reply) => {
    const isDevice = classifyCredential(request).bearerToken?.startsWith(DEVICE_TOKEN_PREFIX) === true;
    const denied = isDevice ? await options.requireDevice(request, reply) : await options.requireOwner(request, reply);
    if (denied !== undefined) return denied;
    if (isDevice) {
      const device = request.device!;
      callers.set(request, {
        kind: 'device', actorKind: 'device', actorId: device.deviceId, rowId: device.deviceId, deviceId: device.deviceId, boundDeviceId: null,
        actor: { kind: 'device', deviceId: device.deviceId, keyId: device.keyId },
      });
      return undefined;
    }
    const ctx = request.owner as OwnerContext;
    const browser = ctx.kind === 'cookie' ? boundBrowser(db, ctx.sessionHash) : null;
    callers.set(request, {
      kind: ctx.kind === 'cookie' ? 'owner-cookie' : 'owner-bearer', actorKind: 'owner', actorId: ctx.ownerId,
      rowId: ctx.kind === 'cookie' ? (browser?.deviceId ?? null) : ctx.deviceId, deviceId: null, boundDeviceId: ctx.kind === 'bearer' ? ctx.deviceId : null,
      actor: browser ? { kind: 'browser', deviceId: browser.deviceId, sessionHash: ctx.sessionHash } : undefined,
    });
    return undefined;
  };

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
      const caller = callers.get(request)!;
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
}
