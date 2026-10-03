import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { Db } from '@dude/sqlite-store';
import { ConfirmApply, ConfirmPreview, ErrorEnvelope, HUB_API_PREFIX, OkResponse, SessionIdParams, SessionListResponse } from '@dude/contracts/hub';
import { emitRevoked } from '../../auth/hub-events.js';
import type { OwnerContext } from '../../auth/owner-auth.js';
import { findSessionByPublicId, listSessions, otherActiveSessionHashes, revokeAllSessions, revokeSession } from '../../auth/sessions.js';
import { audit } from '../../security/audit.js';
import { ConfirmationStore } from '../../security/confirmation-store.js';
import { clearedSessionCookie } from '../../security/cookies.js';
import { envelope } from '../errors.js';
import type { AuthRouteOptions } from './auth.js';

export const REVOKE_ALL_ACTION = 'sessions.revoke-all';

const sha256Hex = (value: string): string => createHash('sha256').update(value).digest('hex');

/** Credential type: owner cookie or bearer session. Revoking emits `session-revoked` on `app.hubEvents`. */
export function registerSessionRoutes(app: FastifyInstance, options: Pick<AuthRouteOptions, 'db' | 'now' | 'confirmations' | 'requireOwner'>): void {
  const { db, now } = options;
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const P = `${HUB_API_PREFIX}/sessions`;
  const nostore = (reply: FastifyReply): void => void reply.header('Cache-Control', 'no-store');
  const digestOf = (database: Db, ctx: OwnerContext): string => sha256Hex(otherActiveSessionHashes(database, ctx.ownerId, ctx.sessionHash, now()).join('\n'));

  typed.get(
    P,
    { preHandler: options.requireOwner, schema: { response: { 200: SessionListResponse, 401: ErrorEnvelope } } },
    async (request, reply) => {
      nostore(reply);
      const ctx = request.owner as OwnerContext;
      return reply.code(200).send(listSessions(db, ctx.ownerId, now(), ctx.sessionHash));
    },
  );

  typed.post(
    `${P}/revoke-all/preview`,
    { preHandler: options.requireOwner, schema: { response: { 200: ConfirmPreview, 401: ErrorEnvelope } } },
    async (request, reply) => {
      nostore(reply);
      const ctx = request.owner as OwnerContext;
      const at = now();
      const affected = otherActiveSessionHashes(db, ctx.ownerId, ctx.sessionHash, at).length;
      const confirmToken = options.confirmations.issue({ action: REVOKE_ALL_ACTION, digest: digestOf(db, ctx), bindingId: ctx.sessionHash, now: at });
      return reply.code(200).send({ confirmToken, expiresAt: ConfirmationStore.expiresAt(at), summary: { action: REVOKE_ALL_ACTION, affectedSessions: affected } });
    },
  );

  typed.post(
    `${P}/revoke-all`,
    {
      preHandler: options.requireOwner,
      schema: { body: ConfirmApply, response: { 200: OkResponse, 401: ErrorEnvelope, 403: ErrorEnvelope, 409: ErrorEnvelope } },
    },
    async (request, reply) => {
      nostore(reply);
      const ctx = request.owner as OwnerContext;
      const result = options.confirmations.consumeDetailed({
        token: request.body.confirmToken, action: REVOKE_ALL_ACTION, digest: digestOf(db, ctx), bindingId: ctx.sessionHash, now: now(),
      });
      if (result === 'invalid') return reply.code(403).send(envelope('forbidden', 'The confirmation is missing, expired or already used.'));
      if (result === 'digest-mismatch') return reply.code(409).send(envelope('conflict', 'The set of sessions changed since the preview.'));
      const revoked = revokeAllSessions(db, ctx.ownerId, ctx.sessionHash, now());
      audit(db, {
        event: 'session.revoked-all', outcome: 'success', actorKind: 'owner', actorId: ctx.ownerId, ip: request.ip || 'unknown',
        detail: { revokedSessions: revoked.length }, now: now(),
      });
      emitRevoked(app, revoked, 'revoke-all');
      return reply.code(200).send({ ok: true });
    },
  );

  typed.delete(
    `${P}/:sessionId`,
    {
      preHandler: options.requireOwner,
      schema: { params: SessionIdParams, response: { 200: OkResponse, 401: ErrorEnvelope, 404: ErrorEnvelope } },
    },
    async (request, reply) => {
      nostore(reply);
      const ctx = request.owner as OwnerContext;
      const target = findSessionByPublicId(db, ctx.ownerId, request.params.sessionId, now());
      const revoked = target ? revokeSession(db, target.sessionHash, now()) : null;
      if (!revoked) return reply.code(404).send(envelope('not-found', 'No such session.'));
      audit(db, {
        event: 'session.revoked', outcome: 'success', actorKind: 'owner', actorId: ctx.ownerId, ip: request.ip || 'unknown',
        detail: { sessionId: revoked.sessionId, kind: revoked.kind, current: revoked.sessionHash === ctx.sessionHash }, now: now(),
      });
      emitRevoked(app, [revoked], 'revoked');
      if (revoked.sessionHash === ctx.sessionHash && ctx.kind === 'cookie') void reply.header('Set-Cookie', clearedSessionCookie());
      return reply.code(200).send({ ok: true });
    },
  );
}
