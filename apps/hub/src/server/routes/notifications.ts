import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { Db } from '@dude/sqlite-store';
import {
  ErrorEnvelope, HUB_NOTIFICATIONS_PATH, HubNotificationsQuery, HubNotificationsResponse, MarkNotificationsReadRequest, NotificationIdParams, OkResponse,
} from '@dude/contracts/hub';
import { DEVICE_TOKEN_PREFIX } from '../../devices/device-tokens.js';
import { hasNotificationsAccess } from '../../devices/registry.js';
import { classifyCredential } from '../../security/request-guard.js';
import { dismissNotification, listNotifications, markNotificationsRead } from '../../notifications/store.js';
import { envelope } from '../errors.js';

type Preparer = (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | undefined>;

export interface NotificationRouteOptions {
  db: Db;
  now: () => number;
  requireOwner: Preparer;
  requireDevice: Preparer;
  /** Tells owner views that notifications changed (`notifyOwnerView('notifications')`). */
  changed: () => void;
}

/**
 * Credential types: owner cookie or bearer session, or a device token whose ACTIVE DESKTOP row holds the owner's notification-reader
 * grant (PD-110). The grant allows exactly these three routes (and `notification` events); a device token without it is 403, a browser
 * row can never hold it, and no other owner route accepts a device credential. Reading, marking read and dismissing are not audited,
 * like marking security alerts seen; cookie POSTs carry the usual Origin and CSRF checks (request guard).
 */
export function registerNotificationRoutes(app: FastifyInstance, options: NotificationRouteOptions): void {
  const { db, now } = options;
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const P = HUB_NOTIFICATIONS_PATH;
  const nostore = (reply: FastifyReply): void => void reply.header('Cache-Control', 'no-store');

  const requireReader: Preparer = async (request, reply) => {
    if (classifyCredential(request).bearerToken?.startsWith(DEVICE_TOKEN_PREFIX) !== true) return options.requireOwner(request, reply);
    const denied = await options.requireDevice(request, reply);
    if (denied !== undefined) return denied;
    if (hasNotificationsAccess(db, request.device!.deviceId)) return undefined;
    return reply.code(403).type('application/json').header('Cache-Control', 'no-store').send(envelope('forbidden', 'This device has not been granted notification access.'));
  };

  typed.get(
    P,
    { preHandler: requireReader, schema: { querystring: HubNotificationsQuery, response: { 200: HubNotificationsResponse, 400: ErrorEnvelope, 401: ErrorEnvelope, 403: ErrorEnvelope } } },
    async (request, reply) => {
      nostore(reply);
      return reply.code(200).send(listNotifications(db, { includeDismissed: request.query.includeDismissed === 'true' }));
    },
  );

  typed.post(
    `${P}/read`,
    { preHandler: requireReader, schema: { body: MarkNotificationsReadRequest, response: { 200: OkResponse, 400: ErrorEnvelope, 401: ErrorEnvelope, 403: ErrorEnvelope } } },
    async (request, reply) => {
      nostore(reply);
      if (markNotificationsRead(db, now(), request.body) > 0) options.changed();
      return reply.code(200).send({ ok: true });
    },
  );

  typed.post(
    `${P}/:id/dismiss`,
    { preHandler: requireReader, schema: { params: NotificationIdParams, response: { 200: OkResponse, 400: ErrorEnvelope, 401: ErrorEnvelope, 403: ErrorEnvelope, 404: ErrorEnvelope } } },
    async (request, reply) => {
      nostore(reply);
      if (!dismissNotification(db, now(), request.params.id)) return reply.code(404).send(envelope('not-found', 'No such notification.'));
      options.changed();
      return reply.code(200).send({ ok: true });
    },
  );
}
