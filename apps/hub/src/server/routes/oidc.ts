import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Type from 'typebox';
import type { Db } from '@dude/sqlite-store';
import {
  ErrorEnvelope, HUB_OIDC_LINK_QUERY, HUB_OIDC_PATHS, HUB_OIDC_SIGN_IN_PAGE, HUB_OIDC_SIGN_IN_QUERY, OIDC_UNLINK_ACTION, OIDC_UNLINK_CONSEQUENCE_CLASS, OidcAccountsResponse,
  OidcLinkCompleteRequest, OidcLinkCompleteResponse, OidcStartRequest, OidcStartResponse, OidcStatusResponse, OidcUnlinkPreview, OidcUnlinkPreviewRequest, OidcUnlinkRequest, OkResponse,
} from '@dude/contracts/hub';
import type { OidcAccount, OidcSignInResult } from '@dude/contracts/hub';
import { getOwner } from '../../auth/owner.js';
import type { OwnerContext } from '../../auth/owner-auth.js';
import { createLinkedIdentities } from '../../auth/oidc/linked-identities.js';
import type { LinkedIdentity } from '../../auth/oidc/linked-identities.js';
import type { OidcClient } from '../../auth/oidc/client.js';
import { createRequireStepUp } from '../../auth/step-up.js';
import { SESSION_POLICY, createSession, sessionDescendsFrom, toSessionInfo } from '../../auth/sessions.js';
import type { CreatedSession } from '../../auth/sessions.js';
import { audit } from '../../security/audit.js';
import { ConfirmationStore } from '../../security/confirmation-store.js';
import { sessionCookie } from '../../security/cookies.js';
import { checkThrottleKeys, lockedReply, recordFailureKeys, recordSuccessKeys, throttleKeys } from '../../security/throttle.js';
import { envelope } from '../errors.js';
import { isNewSignInAddress } from './security-alerts.js';

/**
 * Google (OIDC) sign-in, link and unlink routes (32-SS1, Milestone 842, PD-121, PD-145). Contracts: `@dude/contracts/hub` `oidc.schema.ts`.
 *
 * Credential types: `status`, `start` and `callback` none (the callback is session-less: `security/cross-site-get.ts` strips `Cookie` and
 * `Authorization` before any handler); `link/start` and `link/complete` owner COOKIE session plus step-up; `accounts` owner cookie or
 * bearer; `unlink/preview` and `unlink` owner cookie or bearer plus step-up. Step-up is the owner password (or a recovery code): Google is
 * never a step-up factor, and a session a Google sign-in creates starts NOT stepped up.
 *
 * Failure contract: Google being unreachable, the secret missing or the block absent is an ordinary value here (`oidc-unavailable`, 503,
 * and a redirect to the password page); nothing in this file can make password or recovery sign-in fail, and nothing throws into a request.
 * Every refusal at the callback is the same redirect (`?oidc=failed`), counted into the per-address `oidc` throttle and the automatic IP
 * block exactly like a wrong password, and audited with at most a short hash fingerprint of the provider subject, never an address.
 */

export const OIDC_SWEEP_INTERVAL_MS = 10 * 60_000;
/** At most one `oidc.unreachable` audit row per this long, so a provider outage cannot fill the log. */
const UNREACHABLE_AUDIT_MIN_MS = 60_000;

export const OIDC_UNAVAILABLE_MESSAGE = 'Google sign-in is not available right now. Use your password instead.';

type Preparer = (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | undefined>;

export interface OidcRouteOptions {
  db: Db;
  now: () => number;
  confirmations: ConfirmationStore;
  requireOwner: Preparer;
  requireCookieOwner: Preparer;
  oidc: OidcClient;
}

const ipOf = (request: FastifyRequest): string => request.ip || 'unknown';
const userAgentOf = (request: FastifyRequest): string | undefined => {
  const value = request.headers['user-agent'];
  return typeof value === 'string' && value.length > 0 ? value.slice(0, 256) : undefined;
};

/** A short, one-way tag of a provider subject for the audit trail (never the subject, never an address). */
const fingerprint = (sub: string): string => createHash('sha256').update(`google:${sub}`).digest('hex').slice(0, 12);

const toAccount = (identity: LinkedIdentity): OidcAccount => ({
  id: identity.id, provider: identity.provider, email: identity.email, linkedAt: identity.linkedAt, lastUsedAt: identity.lastUsedAt,
});

/** Adds one query parameter to a same-site path produced by `sanitizeReturnTo` (always starts with a single `/`). */
function withQuery(path: string, name: string, value: string): string {
  const url = new URL(path, 'https://same-site.invalid');
  url.searchParams.set(name, value);
  return `${url.pathname}${url.search}`;
}

const signInRedirect = (result: OidcSignInResult): string => `${HUB_OIDC_SIGN_IN_PAGE}?${HUB_OIDC_SIGN_IN_QUERY}=${result}`;

export function startOidcFlowSweep(oidc: OidcClient, intervalMs: number): () => void {
  const timer = setInterval(() => { try { oidc.flows.sweep(); } catch { /* the table is swept again on the next start */ } }, intervalMs);
  timer.unref();
  return () => { clearInterval(timer); };
}

export function registerOidcRoutes(app: FastifyInstance, options: OidcRouteOptions): void {
  const { db, now, oidc, confirmations } = options;
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const requireStepUp = createRequireStepUp(now);
  const linked = createLinkedIdentities(db, { now });
  const nostore = (reply: FastifyReply): void => void reply.header('Cache-Control', 'no-store');
  const unavailable = (reply: FastifyReply): FastifyReply => reply.code(503).send(envelope('oidc-unavailable', OIDC_UNAVAILABLE_MESSAGE));
  const redirect = (reply: FastifyReply, location: string): FastifyReply => reply.code(302).header('Location', location).header('Cache-Control', 'no-store').send();

  let lastUnreachableAudit = Number.NEGATIVE_INFINITY;
  const auditUnreachable = (ip: string, reason: string): void => {
    const at = now();
    if (at - lastUnreachableAudit < UNREACHABLE_AUDIT_MIN_MS) return;
    lastUnreachableAudit = at;
    audit(db, { event: 'oidc.unreachable', outcome: 'failure', actorKind: 'anonymous', ip, detail: { reason }, now: at });
  };

  // ---- status ---------------------------------------------------------------------------------------------------------------------------
  typed.get(
    HUB_OIDC_PATHS.status,
    { schema: { response: { 200: OidcStatusResponse } } },
    async (_request, reply) => {
      nostore(reply);
      // Offline and cheap: configuration, secret presence and the last known reachability. `unreachable` still offers the button, because
      // only a start attempt can find out Google is back; the click then ends on the password page with an explanation.
      const state = oidc.status().state;
      return reply.code(200).send({ configured: state !== 'off', enabled: state === 'ready' || state === 'unreachable' });
    },
  );

  // ---- sign-in start --------------------------------------------------------------------------------------------------------------------
  typed.post(
    HUB_OIDC_PATHS.start,
    {
      config: { authLimited: true, credentialless: true },
      schema: { body: OidcStartRequest, response: { 200: OidcStartResponse, 400: ErrorEnvelope, 423: ErrorEnvelope, 503: ErrorEnvelope } },
    },
    async (request, reply) => {
      nostore(reply);
      const ip = ipOf(request);
      const decision = checkThrottleKeys(db, throttleKeys.oidc(ip), now());
      if (!decision.allowed) return lockedReply(reply, decision.retryAfterMs);
      const started = await oidc.begin({ purpose: 'signin', returnTo: request.body.returnTo });
      if (started.status !== 'ok') {
        if (started.status !== 'off') auditUnreachable(ip, started.status);
        return unavailable(reply);
      }
      return reply.code(200).send({ authorizationUrl: started.authorizationUrl, expiresAt: started.expiresAt });
    },
  );

  // ---- callback (session-less, always a redirect) -----------------------------------------------------------------------------------------
  typed.get(
    HUB_OIDC_PATHS.callback,
    {
      config: { authLimited: true },
      schema: {
        querystring: Type.Object({
          code: Type.Optional(Type.String({ maxLength: 2048 })), state: Type.Optional(Type.String({ maxLength: 256 })),
          error: Type.Optional(Type.String({ maxLength: 256 })),
        }),
        response: { 302: Type.Null(), 400: ErrorEnvelope },
      },
    },
    async (request, reply) => {
      const ip = ipOf(request);
      const keys = throttleKeys.oidc(ip);
      const decision = checkThrottleKeys(db, keys, now());
      if (!decision.allowed) return redirect(reply, signInRedirect('locked'));
      const { state, code, error } = request.query;

      const fail = (purpose: string | undefined, reason: string, returnTo: string | undefined, count = true): FastifyReply => {
        if (count) recordFailureKeys(db, keys, now());
        audit(db, { event: 'oidc.signin-failed', outcome: 'failure', actorKind: 'anonymous', ip, detail: { purpose: purpose ?? 'unknown', reason }, now: now() });
        return redirect(reply, purpose === 'link' && returnTo !== undefined ? withQuery(returnTo, HUB_OIDC_LINK_QUERY, 'failed') : signInRedirect('failed'));
      };
      const unavailableRedirect = (purpose: string | undefined, returnTo: string | undefined, reason: string): FastifyReply => {
        auditUnreachable(ip, reason);
        return redirect(reply, purpose === 'link' && returnTo !== undefined ? withQuery(returnTo, HUB_OIDC_LINK_QUERY, 'unavailable') : signInRedirect('unavailable'));
      };

      if (!oidc.enabled) return redirect(reply, signInRedirect('unavailable'));

      // The provider reported an error (the owner declined, or Google refused): spend the flow so it cannot be reused. A state that names no
      // live flow is an unsolicited request and counts like any other failed callback; a real cancel does not.
      if (typeof error === 'string' && error.length > 0) {
        const spent = oidc.flows.consume(state);
        return spent.status === 'ok'
          ? fail(spent.flow.purpose, 'provider-error', spent.flow.returnTo, false)
          : fail(undefined, 'provider-error', undefined);
      }

      const result = await oidc.complete({ state, code });
      if (result.status === 'off') return redirect(reply, signInRedirect('unavailable'));
      if (result.status === 'failed') return fail(result.flow?.purpose, result.reason, result.flow?.returnTo);
      if (result.status !== 'ok') return unavailableRedirect(result.flow?.purpose, result.flow?.returnTo, result.status);

      const { flow, identity } = result;
      if (flow.purpose === 'link') {
        // The callback is cross-site and credential-less: it cannot bind anything. It records the verified subject on the flow and hands
        // the browser a one-time token; the signed-in owner's session completes the link on a same-site request.
        const verified = typeof state === 'string' ? oidc.flows.recordVerified(state, { sub: identity.sub, email: identity.email, issuer: identity.issuer }) : undefined;
        if (verified === undefined) return fail('link', 'link-record', flow.returnTo);
        return redirect(reply, withQuery(flow.returnTo, HUB_OIDC_LINK_QUERY, verified.linkToken));
      }

      // Sign-in: only a `sub` the owner already linked, after a signed-in round trip, ever gets a session. Everything else is the same
      // generic refusal, whatever the reason, so nothing here reveals whether an account, a link or an owner exists.
      const owner = getOwner(db);
      const identityRow = linked.findBySub(identity.sub);
      if (owner === null || identityRow === undefined || identityRow.ownerId !== owner.ownerId) {
        recordFailureKeys(db, keys, now());
        audit(db, { event: 'oidc.refused-account', outcome: 'denied', actorKind: 'anonymous', ip, detail: { purpose: 'signin', subjectTag: fingerprint(identity.sub) }, now: now() });
        return redirect(reply, signInRedirect('failed'));
      }
      recordSuccessKeys(db, keys);
      linked.touch(identityRow.id, identity.email);
      const newAddress = isNewSignInAddress(db, ip, now());
      // The same session creation as the password path (same cookie, lifetime, attribution and audit), except that Google is never a
      // step-up factor: the session starts unconfirmed.
      const created: CreatedSession = createSession(db, { ownerId: owner.ownerId, kind: 'cookie', userAgent: userAgentOf(request), ip, now: now(), steppedUp: false });
      const sessionId = toSessionInfo(created.record, undefined).sessionId;
      audit(db, { event: 'owner.sign-in', outcome: 'success', actorKind: 'owner', actorId: owner.ownerId, ip, detail: { sessionId, newAddress, via: 'google' }, now: now() });
      audit(db, { event: 'oidc.signin', outcome: 'success', actorKind: 'owner', actorId: owner.ownerId, ip, detail: { identityId: identityRow.id, sessionId, subjectTag: fingerprint(identity.sub) }, now: now() });
      void reply.header('Set-Cookie', sessionCookie(created.token, SESSION_POLICY.cookie.absoluteMs / 1000));
      return redirect(reply, flow.returnTo);
    },
  );

  // ---- link, leg one: start ---------------------------------------------------------------------------------------------------------------
  typed.post(
    HUB_OIDC_PATHS.linkStart,
    {
      preHandler: [options.requireCookieOwner, requireStepUp],
      schema: { body: OidcStartRequest, response: { 200: OidcStartResponse, 400: ErrorEnvelope, 401: ErrorEnvelope, 403: ErrorEnvelope, 503: ErrorEnvelope } },
    },
    async (request, reply) => {
      nostore(reply);
      const ctx = request.owner as OwnerContext;
      const started = await oidc.begin({ purpose: 'link', ownerId: ctx.ownerId, sessionHash: ctx.sessionHash, returnTo: request.body.returnTo });
      if (started.status !== 'ok') {
        if (started.status !== 'off') auditUnreachable(ipOf(request), started.status);
        return unavailable(reply);
      }
      audit(db, { event: 'oidc.link-started', outcome: 'success', actorKind: 'owner', actorId: ctx.ownerId, ip: ipOf(request), now: now() });
      return reply.code(200).send({ authorizationUrl: started.authorizationUrl, expiresAt: started.expiresAt });
    },
  );

  // ---- link, leg two: the signed-in owner binds the verified subject ---------------------------------------------------------------------
  typed.post(
    HUB_OIDC_PATHS.linkComplete,
    {
      preHandler: [options.requireCookieOwner, requireStepUp],
      schema: { body: OidcLinkCompleteRequest, response: { 200: OidcLinkCompleteResponse, 400: ErrorEnvelope, 401: ErrorEnvelope, 403: ErrorEnvelope, 409: ErrorEnvelope } },
    },
    async (request, reply) => {
      nostore(reply);
      const ctx = request.owner as OwnerContext;
      const ip = ipOf(request);
      const claim = oidc.flows.claimVerified(request.body.linkToken, { ownerId: ctx.ownerId, sessionAllowed: (started) => sessionDescendsFrom(db, started, ctx.sessionHash) });
      if (claim.status !== 'ok') {
        audit(db, { event: 'oidc.link', outcome: 'denied', actorKind: 'owner', actorId: ctx.ownerId, ip, detail: { reason: claim.reason }, now: now() });
        return reply.code(403).send(envelope('forbidden', 'This Google link request is not valid, has expired or belongs to another session. Start again.'));
      }
      // Binds by `sub` ONLY; the address is display text. Never an automatic match on an address.
      const result = linked.link({ ownerId: ctx.ownerId, sub: claim.identity.sub, email: claim.identity.email, issuer: claim.identity.issuer });
      if (result.status === 'already-linked') {
        audit(db, { event: 'oidc.link', outcome: 'denied', actorKind: 'owner', actorId: ctx.ownerId, ip, detail: { reason: 'already-linked', subjectTag: fingerprint(claim.identity.sub) }, now: now() });
        return reply.code(409).send(envelope('conflict', 'That Google account is already linked.'));
      }
      audit(db, { event: 'oidc.link', outcome: 'success', actorKind: 'owner', actorId: ctx.ownerId, ip, detail: { identityId: result.identity.id, subjectTag: fingerprint(claim.identity.sub), accounts: linked.count(ctx.ownerId) }, now: now() });
      return reply.code(200).send({ account: toAccount(result.identity) });
    },
  );

  // ---- linked accounts -------------------------------------------------------------------------------------------------------------------
  typed.get(
    HUB_OIDC_PATHS.accounts,
    { preHandler: options.requireOwner, schema: { response: { 200: OidcAccountsResponse, 401: ErrorEnvelope, 403: ErrorEnvelope } } },
    async (request, reply) => {
      nostore(reply);
      const ctx = request.owner as OwnerContext;
      return reply.code(200).send({ accounts: linked.list(ctx.ownerId).map(toAccount) });
    },
  );

  // ---- unlink: preview, then apply -------------------------------------------------------------------------------------------------------
  // The token is bound to the account id (`bindingId`); its digest covers the session, the account's identity and how many accounts exist,
  // so a changed set between preview and apply is a 409 and nothing is removed.
  const digestOf = (sessionHash: string, target: LinkedIdentity, count: number): string => createHash('sha256').update(`${sessionHash}:${target.id}:${target.linkedAt}:${count}`).digest('hex');

  typed.post(
    HUB_OIDC_PATHS.unlinkPreview,
    {
      preHandler: [options.requireOwner, requireStepUp],
      schema: { body: OidcUnlinkPreviewRequest, response: { 200: OidcUnlinkPreview, 400: ErrorEnvelope, 401: ErrorEnvelope, 403: ErrorEnvelope, 404: ErrorEnvelope, 409: ErrorEnvelope } },
    },
    async (request, reply) => {
      nostore(reply);
      const ctx = request.owner as OwnerContext;
      const accounts = linked.list(ctx.ownerId);
      const target = accounts.find((a) => a.id === request.body.accountId);
      if (target === undefined) return reply.code(404).send(envelope('not-found', 'That Google account is not linked.'));
      // The preview changes nothing and writes nothing; a last account is refused here already, before a token exists.
      if (accounts.length <= 1) return reply.code(409).send(envelope('conflict', 'The last linked Google account cannot be unlinked.'));
      const at = now();
      const confirmToken = confirmations.issue({ action: OIDC_UNLINK_ACTION, digest: digestOf(ctx.sessionHash, target, accounts.length), bindingId: target.id, now: at });
      return reply.code(200).send({
        confirmToken, expiresAt: ConfirmationStore.expiresAt(at), consequenceClass: [...OIDC_UNLINK_CONSEQUENCE_CLASS],
        summary: { action: OIDC_UNLINK_ACTION, accountId: target.id, email: target.email, remainingAccounts: accounts.length - 1 },
      });
    },
  );

  typed.post(
    HUB_OIDC_PATHS.unlink,
    {
      preHandler: [options.requireOwner, requireStepUp],
      schema: { body: OidcUnlinkRequest, response: { 200: OkResponse, 400: ErrorEnvelope, 401: ErrorEnvelope, 403: ErrorEnvelope, 404: ErrorEnvelope, 409: ErrorEnvelope } },
    },
    async (request, reply) => {
      nostore(reply);
      const ctx = request.owner as OwnerContext;
      const ip = ipOf(request);
      const accounts = linked.list(ctx.ownerId);
      const target = accounts.find((a) => a.id === request.body.accountId);
      const verdict = confirmations.consumeDetailed({
        token: request.body.confirmToken, action: OIDC_UNLINK_ACTION, digest: target === undefined ? 'none' : digestOf(ctx.sessionHash, target, accounts.length), bindingId: request.body.accountId, now: now(),
      });
      if (verdict === 'invalid') return reply.code(403).send(envelope('forbidden', 'The confirmation is missing, expired, already used or belongs to another account.'));
      if (target === undefined) return reply.code(404).send(envelope('not-found', 'That Google account is not linked.'));
      if (accounts.length <= 1) {
        audit(db, { event: 'oidc.unlink', outcome: 'denied', actorKind: 'owner', actorId: ctx.ownerId, ip, detail: { reason: 'last-account', identityId: target.id }, now: now() });
        return reply.code(409).send(envelope('conflict', 'The last linked Google account cannot be unlinked.'));
      }
      if (verdict === 'digest-mismatch') return reply.code(409).send(envelope('conflict', 'The linked accounts changed since the preview.'));
      const result = linked.unlink(ctx.ownerId, target.id);
      if (result.status === 'last-identity') {
        audit(db, { event: 'oidc.unlink', outcome: 'denied', actorKind: 'owner', actorId: ctx.ownerId, ip, detail: { reason: 'last-account', identityId: target.id }, now: now() });
        return reply.code(409).send(envelope('conflict', 'The last linked Google account cannot be unlinked.'));
      }
      if (result.status === 'not-found') return reply.code(404).send(envelope('not-found', 'That Google account is not linked.'));
      audit(db, { event: 'oidc.unlink', outcome: 'success', actorKind: 'owner', actorId: ctx.ownerId, ip, detail: { identityId: target.id, remaining: accounts.length - 1 }, now: now() });
      return reply.code(200).send({ ok: true });
    },
  );
}
