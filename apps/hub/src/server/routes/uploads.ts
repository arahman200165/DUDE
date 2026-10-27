import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Type from 'typebox';
import {
  ErrorEnvelope, HUB_UPLOADS_PATH, OkResponse, UPLOAD_BODY_LIMIT, UPLOAD_CHUNK_HASH_HEADER, UPLOAD_CONTENT_TYPE, UploadChunkResponse, UploadCompleteResponse,
  UploadCreateRequest, UploadSession,
} from '@dude/contracts/hub';
import type { OwnerContext } from '../../auth/owner-auth.js';
import type { UploadFailure, UploadPrincipal, UploadService } from '../../uploads/upload-service.js';
import { envelope } from '../errors.js';

type Preparer = (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | undefined>;

export interface UploadRouteOptions {
  requireOwner: Preparer;
  /** The upload service, supplied by `run` once `savesphere.db` is open; without it every route answers 409. */
  service: () => UploadService | undefined;
}

export const UPLOADS_UNAVAILABLE_MESSAGE = 'SaveSphere storage is not set up on this Hub yet. Run "dude-hub provision" first.';

const IdParams = Type.Object({ id: Type.String({ minLength: 1, maxLength: 64 }) });
const ChunkParams = Type.Object({ id: Type.String({ minLength: 1, maxLength: 64 }), index: Type.String({ pattern: '^[0-9]{1,9}$' }) });
const ERRORS = { 400: ErrorEnvelope, 401: ErrorEnvelope, 403: ErrorEnvelope, 404: ErrorEnvelope, 409: ErrorEnvelope, 507: ErrorEnvelope } as const;

/**
 * The resumable upload route family (32-SS1, Milestone 845, PD-118, PD-148). Contracts: `@dude/contracts/hub` `uploads.schema.ts`.
 * Credential type: owner cookie (plus CSRF) or owner bearer session on every route; a device token is 403, an ingest token or anything
 * else 401, an anonymous request 401. The session core (`uploads/upload-service.ts`) is credential-agnostic: this file is the only place
 * that knows the credential class.
 *
 * The chunk route is the one non-JSON route of the Hub. It lives in its own encapsulated Fastify context whose only addition is a
 * content-type parser for `application/octet-stream` that hands the handler the RAW request stream (nothing is buffered, so memory does
 * not grow with the chunk or the file); every other route, here and elsewhere, keeps the JSON parser and the 64 KiB `HUB_BODY_LIMIT`.
 * The request guard admits that one content type on that one route (`security/request-guard.ts`). The body limit is the session's chunk
 * size, checked against `Content-Length` (required; chunked transfer is refused with 411) before a byte is read. A 411 or 413 answer carries
 * `Connection: close`, so an oversized or unbounded body is dropped with the socket instead of being read; every other refusal leaves
 * the (at most `UPLOAD_BODY_LIMIT`) body to Node, which discards it, so a client always gets the status rather than a reset.
 */
export function registerUploadRoutes(app: FastifyInstance, options: UploadRouteOptions): void {
  void app.register(async (scope) => {
    scope.addContentTypeParser(UPLOAD_CONTENT_TYPE, (_request, payload, done) => { done(null, payload); });
    const typed = scope.withTypeProvider<TypeBoxTypeProvider>();
    const nostore = (reply: FastifyReply): void => void reply.header('Cache-Control', 'no-store');
    const principalOf = (request: FastifyRequest): UploadPrincipal => ({ kind: 'owner', id: (request.owner as OwnerContext).ownerId });
    const refuse = (reply: FastifyReply, failure: UploadFailure, closeConnection = false): FastifyReply => {
      if (closeConnection || failure.status === 411 || failure.status === 413) void reply.header('Connection', 'close');
      return reply.code(failure.status).send(envelope(failure.code, failure.message));
    };
    const unavailable = (reply: FastifyReply): FastifyReply => {
      return reply.code(409).send(envelope('conflict', UPLOADS_UNAVAILABLE_MESSAGE));
    };

    typed.post(
      HUB_UPLOADS_PATH,
      { preHandler: options.requireOwner, schema: { body: UploadCreateRequest, response: { 201: UploadSession, ...ERRORS } } },
      async (request, reply) => {
        nostore(reply);
        const service = options.service();
        if (service === undefined) return unavailable(reply);
        const outcome = service.create(principalOf(request), request.body);
        return outcome.ok ? reply.code(201).send(outcome.value) : refuse(reply, outcome);
      },
    );

    typed.get(
      `${HUB_UPLOADS_PATH}/:id`,
      { preHandler: options.requireOwner, schema: { params: IdParams, response: { 200: UploadSession, ...ERRORS } } },
      async (request, reply) => {
        nostore(reply);
        const service = options.service();
        if (service === undefined) return unavailable(reply);
        const outcome = service.status(principalOf(request), request.params.id);
        return outcome.ok ? reply.code(200).send(outcome.value) : refuse(reply, outcome);
      },
    );

    typed.put(
      `${HUB_UPLOADS_PATH}/:id/chunks/:index`,
      { bodyLimit: UPLOAD_BODY_LIMIT, preHandler: options.requireOwner, schema: { params: ChunkParams, response: { 200: UploadChunkResponse, 411: ErrorEnvelope, 413: ErrorEnvelope, ...ERRORS } } },
      async (request, reply) => {
        nostore(reply);
        const service = options.service();
        if (service === undefined) return unavailable(reply);
        // `Content-Length` is required and trusted for the limit: Node's HTTP parser enforces that exactly that many bytes make up the body.
        const lengthHeader = request.headers['content-length'];
        if (typeof lengthHeader !== 'string' || !/^[0-9]{1,15}$/.test(lengthHeader) || request.headers['transfer-encoding'] !== undefined) {
          return refuse(reply, { ok: false, status: 411, code: 'bad-request', message: 'A chunk needs a Content-Length (chunked transfer is not accepted).' });
        }
        const contentLength = Number(lengthHeader);
        if (contentLength > UPLOAD_BODY_LIMIT) return refuse(reply, { ok: false, status: 413, code: 'payload-too-large', message: 'The chunk is larger than any upload accepts.' });
        const claimedHeader = request.headers[UPLOAD_CHUNK_HASH_HEADER];
        if (claimedHeader !== undefined && typeof claimedHeader !== 'string') return refuse(reply, { ok: false, status: 400, code: 'bad-request', message: 'One chunk SHA-256 header is allowed.' });
        const index = Number(request.params.index);
        const outcome = await service.putChunk(principalOf(request), request.params.id, index, request.body as AsyncIterable<Uint8Array>, {
          contentLength, ...(claimedHeader === undefined ? {} : { claimedSha256: claimedHeader.toLowerCase() }),
        });
        return outcome.ok ? reply.code(200).send(outcome.value) : refuse(reply, outcome);
      },
    );

    typed.post(
      `${HUB_UPLOADS_PATH}/:id/complete`,
      { preHandler: options.requireOwner, schema: { params: IdParams, response: { 200: UploadCompleteResponse, 202: UploadSession, ...ERRORS } } },
      async (request, reply) => {
        nostore(reply);
        const service = options.service();
        if (service === undefined) return unavailable(reply);
        const outcome = await service.complete(principalOf(request), request.params.id);
        if (!outcome.ok) return refuse(reply, outcome);
        // 200 with the blob identity, or 202 with the session while a long assembly is still running (call again, or poll the status).
        return outcome.value.kind === 'complete' ? reply.code(200).send(outcome.value.value) : reply.code(202).send(outcome.value.value);
      },
    );

    typed.delete(
      `${HUB_UPLOADS_PATH}/:id`,
      { preHandler: options.requireOwner, schema: { params: IdParams, response: { 200: OkResponse, ...ERRORS } } },
      async (request, reply) => {
        nostore(reply);
        const service = options.service();
        if (service === undefined) return unavailable(reply);
        const outcome = await service.abort(principalOf(request), request.params.id);
        return outcome.ok ? reply.code(200).send({ ok: true as const }) : refuse(reply, outcome);
      },
    );
  });
}
