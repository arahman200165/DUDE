import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { transaction } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import {
  ChangePasswordRequest, ConfirmApply, ConfirmPreview, CurrentSessionResponse, ErrorEnvelope, HUB_API_PREFIX, OkResponse, OwnerResetRequest,
  OwnerResetResponse, RecoverRequest, RecoveryCodesResponse, SignInRequest, SignInResponse,
} from '@dude/contracts/hub';
import { emitRevoked } from '../../auth/hub-events.js';
import { getOwner, getStoredPassword, remainingRecoveryCodes, setStoredPassword } from '../../auth/owner.js';
import type { OwnerContext } from '../../auth/owner-auth.js';
import { hashPassword, validateOwnerPassword, verifyPassword } from '../../auth/password.js';
import type { PasswordParams } from '../../auth/password.js';
import { consumeRecoveryCode, replaceRecoveryCodes } from '../../auth/recovery-codes.js';
import { SESSION_POLICY, createSession, deriveCsrfToken, revokeAllSessions, revokeSession, toSessionInfo } from '../../auth/sessions.js';
import type { CreatedSession } from '../../auth/sessions.js';
import { consumeSetupToken, deleteSetupTokenFile, resetPending, verifySetupToken } from '../../auth/setup-token.js';
import { audit } from '../../security/audit.js';
import { ConfirmationStore } from '../../security/confirmation-store.js';
import { clearedSessionCookie, sessionCookie } from '../../security/cookies.js';
import { checkThrottleKeys, lockedReply, recordFailureKeys, recordSuccessKeys, throttleKeys } from '../../security/throttle.js';
import { envelope } from '../errors.js';

type Preparer = (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | undefined>;

export interface AuthRouteOptions {
  db: Db;
  configDir: string;
  now: () => number;
  confirmations: ConfirmationStore;
  /** Owner by cookie or bearer. */
  requireOwner: Preparer;
  /** Owner by cookie only (the CSRF token belongs to cookie sessions). */
  requireCookieOwner: Preparer;
  passwordParams?: PasswordParams;
}

export const RECOVERY_CODES_ACTION = 'owner.recovery-codes';

const sha256Hex = (value: string): string => createHash('sha256').update(value).digest('hex');
const ipOf = (request: FastifyRequest): string => request.ip || 'unknown';
const userAgentOf = (request: FastifyRequest): string | undefined => {
  const value = request.headers['user-agent'];
  return typeof value === 'string' && value.length > 0 ? value.slice(0, 256) : undefined;
};

function signInBody(db: Db, created: CreatedSession, owner: { ownerId: string; displayName: string }) {
  return {
    csrfToken: created.csrfToken ?? '',
    session: toSessionInfo(created.record, created.record.sessionHash),
    owner: { ownerId: owner.ownerId, displayName: owner.displayName, remainingRecoveryCodes: remainingRecoveryCodes(db, owner.ownerId) },
  };
}

function setSessionCookie(reply: FastifyReply, created: CreatedSession): void {
  void reply.header('Set-Cookie', sessionCookie(created.token, SESSION_POLICY.cookie.absoluteMs / 1000));
}

/** Credential types: none (sign-in, recover, owner reset), owner cookie/bearer session (the rest). */
export function registerAuthRoutes(app: FastifyInstance, options: AuthRouteOptions): void {
  const { db, now } = options;
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const P = HUB_API_PREFIX;
  const nostore = (reply: FastifyReply): void => void reply.header('Cache-Control', 'no-store');
  const hashFor = (password: string) => hashPassword(password, options.passwordParams);

  typed.post(
    `${P}/auth/sign-in`,
    {
      config: { authLimited: true, credentialless: true },
      schema: { body: SignInRequest, response: { 200: SignInResponse, 400: ErrorEnvelope, 401: ErrorEnvelope, 409: ErrorEnvelope } },
    },
    async (request, reply) => {
      nostore(reply);
      const ip = ipOf(request);
      const keys = throttleKeys.password(ip);
      const owner = getOwner(db);
      if (owner === null) return reply.code(409).send(envelope('conflict', 'This Hub has no owner yet.'));
      const decision = checkThrottleKeys(db, keys, now());
      if (!decision.allowed) return lockedReply(reply, decision.retryAfterMs);

      const stored = getStoredPassword(db, owner.ownerId);
      if (stored === null || !(await verifyPassword(request.body.password, stored))) {
        recordFailureKeys(db, keys, now());
        audit(db, { event: 'auth.failure', outcome: 'failure', actorKind: 'anonymous', ip, detail: { kind: 'password' }, now: now() });
        return reply.code(401).send(envelope('unauthorized', 'The password is not correct.'));
      }
      recordSuccessKeys(db, keys);
      const created = createSession(db, { ownerId: owner.ownerId, kind: 'cookie', userAgent: userAgentOf(request), ip, now: now() });
      audit(db, { event: 'owner.sign-in', outcome: 'success', actorKind: 'owner', actorId: owner.ownerId, ip, detail: { sessionId: toSessionInfo(created.record, undefined).sessionId }, now: now() });
      setSessionCookie(reply, created);
      return reply.code(200).send(signInBody(db, created, owner));
    },
  );

  typed.get(
    `${P}/auth/session`,
    { preHandler: options.requireCookieOwner, schema: { response: { 200: CurrentSessionResponse, 401: ErrorEnvelope } } },
    async (request, reply) => {
      nostore(reply);
      const ctx = request.owner as OwnerContext;
      const owner = getOwner(db);
      if (owner === null) return reply.code(401).send(envelope('unauthorized', 'Authentication is required.'));
      return reply.code(200).send({
        csrfToken: deriveCsrfToken(db, ctx.sessionHash),
        session: toSessionInfo(ctx.session, ctx.sessionHash),
        owner: { ownerId: owner.ownerId, displayName: owner.displayName, remainingRecoveryCodes: remainingRecoveryCodes(db, owner.ownerId) },
      });
    },
  );

  typed.post(
    `${P}/auth/sign-out`,
    { preHandler: options.requireOwner, schema: { response: { 200: OkResponse, 401: ErrorEnvelope } } },
    async (request, reply) => {
      nostore(reply);
      const ctx = request.owner as OwnerContext;
      const revoked = revokeSession(db, ctx.sessionHash, now());
      if (revoked) emitRevoked(app, [revoked], 'sign-out');
      audit(db, { event: 'owner.sign-out', outcome: 'success', actorKind: 'owner', actorId: ctx.ownerId, ip: ipOf(request), detail: { sessionId: revoked?.sessionId ?? null }, now: now() });
      if (ctx.kind === 'cookie') void reply.header('Set-Cookie', clearedSessionCookie());
      return reply.code(200).send({ ok: true });
    },
  );

  typed.post(
    `${P}/auth/recover`,
    {
      config: { authLimited: true, credentialless: true },
      schema: { body: RecoverRequest, response: { 200: SignInResponse, 400: ErrorEnvelope, 401: ErrorEnvelope, 409: ErrorEnvelope } },
    },
    async (request, reply) => {
      nostore(reply);
      const ip = ipOf(request);
      const keys = throttleKeys['recovery-code'](ip);
      const owner = getOwner(db);
      if (owner === null) return reply.code(409).send(envelope('conflict', 'This Hub has no owner yet.'));
      const decision = checkThrottleKeys(db, keys, now());
      if (!decision.allowed) return lockedReply(reply, decision.retryAfterMs);

      // The policy is checked before the code is consumed, so a rejected password never burns a code.
      const policy = validateOwnerPassword(request.body.newPassword);
      if (!policy.ok) return reply.code(400).send(envelope('bad-request', `Password rejected: ${policy.reason}.`));
      const credential = await hashFor(request.body.newPassword);

      const outcome = transaction(db, () => {
        if (!consumeRecoveryCode(db, owner.ownerId, request.body.recoveryCode, now())) return null;
        setStoredPassword(db, owner.ownerId, credential, now());
        const revoked = revokeAllSessions(db, owner.ownerId, undefined, now());
        const created = createSession(db, { ownerId: owner.ownerId, kind: 'cookie', userAgent: userAgentOf(request), ip, now: now() });
        audit(db, { event: 'owner.recovery-code-used', outcome: 'success', actorKind: 'owner', actorId: owner.ownerId, ip, detail: { revokedSessions: revoked.length }, now: now() });
        return { revoked, created };
      });
      if (outcome === null) {
        recordFailureKeys(db, keys, now());
        audit(db, { event: 'auth.failure', outcome: 'failure', actorKind: 'anonymous', ip, detail: { kind: 'recovery-code' }, now: now() });
        return reply.code(401).send(envelope('unauthorized', 'The recovery code is not valid.'));
      }
      recordSuccessKeys(db, keys);
      emitRevoked(app, outcome.revoked, 'recovery');
      setSessionCookie(reply, outcome.created);
      return reply.code(200).send(signInBody(db, outcome.created, owner));
    },
  );

  typed.post(
    `${P}/owner/password`,
    {
      preHandler: options.requireOwner,
      schema: { body: ChangePasswordRequest, response: { 200: OkResponse, 400: ErrorEnvelope, 401: ErrorEnvelope, 403: ErrorEnvelope } },
    },
    async (request, reply) => {
      nostore(reply);
      const ctx = request.owner as OwnerContext;
      const ip = ipOf(request);
      const keys = throttleKeys.password(ip);
      const decision = checkThrottleKeys(db, keys, now());
      if (!decision.allowed) return lockedReply(reply, decision.retryAfterMs);

      const stored = getStoredPassword(db, ctx.ownerId);
      if (stored === null || !(await verifyPassword(request.body.currentPassword, stored))) {
        recordFailureKeys(db, keys, now());
        audit(db, { event: 'auth.failure', outcome: 'failure', actorKind: 'owner', actorId: ctx.ownerId, ip, detail: { kind: 'password' }, now: now() });
        return reply.code(403).send(envelope('forbidden', 'The current password is not correct.'));
      }
      const policy = validateOwnerPassword(request.body.newPassword);
      if (!policy.ok) return reply.code(400).send(envelope('bad-request', `Password rejected: ${policy.reason}.`));
      const credential = await hashFor(request.body.newPassword);
      recordSuccessKeys(db, keys);

      const revoked = transaction(db, () => {
        setStoredPassword(db, ctx.ownerId, credential, now());
        const others = revokeAllSessions(db, ctx.ownerId, ctx.sessionHash, now());
        audit(db, { event: 'owner.password-changed', outcome: 'success', actorKind: 'owner', actorId: ctx.ownerId, ip, detail: { revokedSessions: others.length }, now: now() });
        return others;
      });
      emitRevoked(app, revoked, 'password-changed');
      return reply.code(200).send({ ok: true });
    },
  );

  const recoveryDigest = (ownerId: string): string => {
    const row = db.prepare('SELECT MAX(generation) AS g FROM recovery_codes WHERE owner_id = ?').get(ownerId) as { g: number | null };
    return sha256Hex(`${row.g ?? 0}:${remainingRecoveryCodes(db, ownerId)}`);
  };

  typed.post(
    `${P}/owner/recovery-codes/preview`,
    { preHandler: options.requireOwner, schema: { response: { 200: ConfirmPreview, 401: ErrorEnvelope } } },
    async (request, reply) => {
      nostore(reply);
      const ctx = request.owner as OwnerContext;
      const at = now();
      const confirmToken = options.confirmations.issue({ action: RECOVERY_CODES_ACTION, digest: recoveryDigest(ctx.ownerId), bindingId: ctx.sessionHash, now: at });
      return reply.code(200).send({
        confirmToken, expiresAt: ConfirmationStore.expiresAt(at),
        summary: { action: RECOVERY_CODES_ACTION, remainingRecoveryCodes: remainingRecoveryCodes(db, ctx.ownerId) },
      });
    },
  );

  typed.post(
    `${P}/owner/recovery-codes`,
    {
      preHandler: options.requireOwner,
      schema: { body: ConfirmApply, response: { 200: RecoveryCodesResponse, 401: ErrorEnvelope, 403: ErrorEnvelope, 409: ErrorEnvelope } },
    },
    async (request, reply) => {
      nostore(reply);
      const ctx = request.owner as OwnerContext;
      const result = options.confirmations.consumeDetailed({
        token: request.body.confirmToken, action: RECOVERY_CODES_ACTION, digest: recoveryDigest(ctx.ownerId), bindingId: ctx.sessionHash, now: now(),
      });
      if (result === 'invalid') return reply.code(403).send(envelope('forbidden', 'The confirmation is missing, expired or already used.'));
      if (result === 'digest-mismatch') return reply.code(409).send(envelope('conflict', 'The recovery codes changed since the preview.'));
      const recoveryCodes = replaceRecoveryCodes(db, ctx.ownerId, now());
      audit(db, { event: 'owner.recovery-codes-regenerated', outcome: 'success', actorKind: 'owner', actorId: ctx.ownerId, ip: ipOf(request), now: now() });
      return reply.code(200).send({ recoveryCodes });
    },
  );

  typed.post(
    `${P}/owner/reset`,
    {
      config: { authLimited: true, credentialless: true },
      schema: { body: OwnerResetRequest, response: { 200: OwnerResetResponse, 400: ErrorEnvelope, 401: ErrorEnvelope, 409: ErrorEnvelope } },
    },
    async (request, reply) => {
      nostore(reply);
      const ip = ipOf(request);
      const keys = throttleKeys['setup-token'](ip);
      const decision = checkThrottleKeys(db, keys, now());
      if (!decision.allowed) return lockedReply(reply, decision.retryAfterMs);
      const owner = getOwner(db);
      if (owner === null || !resetPending(db)) return reply.code(409).send(envelope('conflict', 'No owner reset is pending.'));

      if (!verifySetupToken(db, request.body.resetToken, 'owner-reset')) {
        recordFailureKeys(db, keys, now());
        audit(db, { event: 'auth.failure', outcome: 'failure', actorKind: 'anonymous', ip, detail: { kind: 'setup-token' }, now: now() });
        return reply.code(401).send(envelope('unauthorized', 'The reset token is not valid.'));
      }
      const policy = validateOwnerPassword(request.body.newPassword);
      if (!policy.ok) return reply.code(400).send(envelope('bad-request', `Password rejected: ${policy.reason}.`));
      const credential = await hashFor(request.body.newPassword);

      const outcome = transaction(db, () => {
        if (!verifySetupToken(db, request.body.resetToken, 'owner-reset')) return null;
        setStoredPassword(db, owner.ownerId, credential, now());
        const recoveryCodes = replaceRecoveryCodes(db, owner.ownerId, now());
        consumeSetupToken(db, now());
        const revoked = revokeAllSessions(db, owner.ownerId, undefined, now());
        audit(db, { event: 'owner.password-changed', outcome: 'success', actorKind: 'owner', actorId: owner.ownerId, ip, detail: { via: 'owner-reset', revokedSessions: revoked.length }, now: now() });
        return { recoveryCodes, revoked };
      });
      if (outcome === null) return reply.code(409).send(envelope('conflict', 'No owner reset is pending.'));
      recordSuccessKeys(db, keys);
      deleteSetupTokenFile(options.configDir);
      emitRevoked(app, outcome.revoked, 'owner-reset');
      return reply.code(200).send({ recoveryCodes: outcome.recoveryCodes });
    },
  );
}
