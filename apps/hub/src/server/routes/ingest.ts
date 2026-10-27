import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Type from 'typebox';
import {
  ErrorEnvelope, HUB_INGEST_PATHS, INGEST_PATH_PREFIX, INGEST_REVOKE_ACTION, INGEST_REVOKE_CONSEQUENCE_CLASS, IngestPingResponse, IngestTokenCreateRequest,
  IngestTokenCreateResponse, IngestTokenListResponse, IngestTokenRevokePreview, IngestTokenRevokeRequest, OkResponse,
} from '@dude/contracts/hub';
import { createRequireIngest } from '../../auth/ingest-auth.js';
import type { IngestAuthOptions } from '../../auth/ingest-auth.js';
import type { OwnerContext } from '../../auth/owner-auth.js';
import { createRequireStepUp } from '../../auth/step-up.js';
import type { IngestTokenStore } from '../../ingest/ingest-tokens.js';
import { ConfirmationStore } from '../../security/confirmation-store.js';
import { envelope } from '../errors.js';

type Preparer = (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | undefined>;

export interface IngestRouteOptions extends Pick<IngestAuthOptions, 'store' | 'hubDb' | 'limiter' | 'now'> {
  confirmations: ConfirmationStore;
  requireOwner: Preparer;
}

/** Shown to the owner when SaveSphere storage (`savesphere.db`, created by `dude-hub provision`) does not exist yet. */
export const INGEST_UNAVAILABLE_MESSAGE = 'SaveSphere storage is not set up on this Hub yet. Run "dude-hub provision" first.';

/**
 * Ingest token routes (32-SS1, Milestone 843, PD-119, PD-149). Contracts: `@dude/contracts/hub` `ingest.schema.ts`.
 *
 * Credential types: `GET /ingest/ping` accepts an INGEST TOKEN only (`Authorization: Bearer dit_...`). `/api/v1/ingest/*` is the token-only
 * namespace, so the owner's management routes are `/api/v1/admin/ingest-tokens`: list is owner cookie or bearer; create, revoke preview and
 * revoke are owner cookie or bearer plus step-up (revoke is two-step with the ConfirmationStore, `secret-management`). Only the create
 * response ever carries a secret. No cookie is read or set under `/api/v1/ingest/`, and no CORS header is ever sent there (ingest is for
 * extensions, scripts and shortcuts; Milestone 852/32-SS3 decide whether any browser origin ever needs one).
 */
export function registerIngestRoutes(app: FastifyInstance, options: IngestRouteOptions): void {
  const { now, confirmations } = options;
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const requireIngest = createRequireIngest(options);
  const requireStepUp = createRequireStepUp(now);
  const nostore = (reply: FastifyReply): void => void reply.header('Cache-Control', 'no-store');
  const unavailable = (reply: FastifyReply): FastifyReply => reply.code(409).send(envelope('conflict', INGEST_UNAVAILABLE_MESSAGE));

  // The token-only namespace never sees a cookie and never sets one.
  const isIngestPath = (url: string): boolean => (url.split('?')[0] ?? '').startsWith(INGEST_PATH_PREFIX);
  app.addHook('onRequest', async (request) => {
    if (isIngestPath(request.url)) delete request.headers.cookie;
  });
  app.addHook('onSend', async (request, reply, payload) => {
    if (isIngestPath(request.url)) {
      void reply.removeHeader('set-cookie');
      void reply.removeHeader('access-control-allow-origin');
    }
    return payload;
  });

  typed.get(
    HUB_INGEST_PATHS.ping,
    { preHandler: requireIngest('ingest:ping'), schema: { response: { 200: IngestPingResponse, 401: ErrorEnvelope, 403: ErrorEnvelope, 429: ErrorEnvelope } } },
    async (request, reply) => {
      nostore(reply);
      const ctx = request.ingest!;
      return reply.code(200).send({ ok: true as const, tokenId: ctx.tokenId, scopes: [...ctx.scopes], serverTime: new Date(now()).toISOString() });
    },
  );

  const store = (): IngestTokenStore | undefined => options.store();

  typed.get(
    HUB_INGEST_PATHS.tokens,
    { preHandler: options.requireOwner, schema: { response: { 200: IngestTokenListResponse, 401: ErrorEnvelope, 403: ErrorEnvelope, 409: ErrorEnvelope } } },
    async (_request, reply) => {
      nostore(reply);
      const tokens = store();
      return tokens === undefined ? unavailable(reply) : reply.code(200).send({ tokens: tokens.list() });
    },
  );

  typed.post(
    HUB_INGEST_PATHS.tokens,
    {
      preHandler: [options.requireOwner, requireStepUp],
      schema: { body: IngestTokenCreateRequest, response: { 201: IngestTokenCreateResponse, 400: ErrorEnvelope, 401: ErrorEnvelope, 403: ErrorEnvelope, 409: ErrorEnvelope } },
    },
    async (request, reply) => {
      nostore(reply);
      const tokens = store();
      if (tokens === undefined) return unavailable(reply);
      const ctx = request.owner as OwnerContext;
      const label = request.body.label.trim();
      if (label.length === 0) return reply.code(400).send(envelope('bad-request', 'The request is not valid.'));
      const created = tokens.create(ctx.ownerId, { label, scopes: request.body.scopes, ...(request.body.expiresInDays === undefined ? {} : { expiresInDays: request.body.expiresInDays }) });
      if (created.status === 'limit') return reply.code(409).send(envelope('conflict', 'Too many ingest tokens exist. Revoke one first.'));
      return reply.code(201).send({ token: created.info, secret: created.secret });
    },
  );

  // ---- revoke: preview, then apply -------------------------------------------------------------------------------------------------------
  // The token is bound to the ingest token id; its digest covers the session and the token's identity, so a different session or a token that
  // changed between preview and apply is refused and nothing is revoked.
  const digestOf = (sessionHash: string, id: string, createdAt: string): string => createHash('sha256').update(`${sessionHash}:${id}:${createdAt}`).digest('hex');
  const Params = Type.Object({ id: Type.String({ minLength: 1, maxLength: 64 }) });

  typed.post(
    `${HUB_INGEST_PATHS.tokens}/:id/revoke/preview`,
    {
      preHandler: [options.requireOwner, requireStepUp],
      schema: { params: Params, response: { 200: IngestTokenRevokePreview, 400: ErrorEnvelope, 401: ErrorEnvelope, 403: ErrorEnvelope, 404: ErrorEnvelope, 409: ErrorEnvelope } },
    },
    async (request, reply) => {
      nostore(reply);
      const tokens = store();
      if (tokens === undefined) return unavailable(reply);
      const ctx = request.owner as OwnerContext;
      const target = tokens.get(request.params.id);
      if (target === undefined) return reply.code(404).send(envelope('not-found', 'That ingest token does not exist.'));
      if (target.state === 'revoked') return reply.code(409).send(envelope('conflict', 'That ingest token is already revoked.'));
      // The preview changes nothing and writes nothing (no audit row).
      const at = now();
      const confirmToken = confirmations.issue({ action: INGEST_REVOKE_ACTION, digest: digestOf(ctx.sessionHash, target.id, target.createdAt), bindingId: target.id, now: at });
      return reply.code(200).send({
        confirmToken, expiresAt: ConfirmationStore.expiresAt(at), consequenceClass: [...INGEST_REVOKE_CONSEQUENCE_CLASS],
        summary: { action: INGEST_REVOKE_ACTION, id: target.id, label: target.label, prefix: target.prefix },
      });
    },
  );

  typed.post(
    `${HUB_INGEST_PATHS.tokens}/:id/revoke`,
    {
      preHandler: [options.requireOwner, requireStepUp],
      schema: { params: Params, body: IngestTokenRevokeRequest, response: { 200: OkResponse, 400: ErrorEnvelope, 401: ErrorEnvelope, 403: ErrorEnvelope, 404: ErrorEnvelope, 409: ErrorEnvelope } },
    },
    async (request, reply) => {
      nostore(reply);
      const tokens = store();
      if (tokens === undefined) return unavailable(reply);
      const ctx = request.owner as OwnerContext;
      const target = tokens.get(request.params.id);
      const verdict = confirmations.consumeDetailed({
        token: request.body.confirmToken, action: INGEST_REVOKE_ACTION, digest: target === undefined ? 'none' : digestOf(ctx.sessionHash, target.id, target.createdAt),
        bindingId: request.params.id, now: now(),
      });
      if (verdict === 'invalid') return reply.code(403).send(envelope('forbidden', 'The confirmation is missing, expired, already used or belongs to another ingest token.'));
      if (target === undefined) return reply.code(404).send(envelope('not-found', 'That ingest token does not exist.'));
      if (verdict === 'digest-mismatch') return reply.code(409).send(envelope('conflict', 'The ingest token changed since the preview.'));
      const result = tokens.revoke(ctx.ownerId, target.id);
      if (result.status === 'not-found') return reply.code(404).send(envelope('not-found', 'That ingest token does not exist.'));
      if (result.status === 'already-revoked') return reply.code(409).send(envelope('conflict', 'That ingest token is already revoked.'));
      return reply.code(200).send({ ok: true as const });
    },
  );
}
