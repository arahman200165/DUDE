import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Db } from '@dude/sqlite-store';
import type { SessionKind } from '@dude/contracts/hub';
import { classifyCredential } from '../security/request-guard.js';
import { envelope } from '../server/errors.js';
import { DEVICE_TOKEN_PREFIX } from '../devices/device-tokens.js';
import { OWNER_BEARER_PREFIX, resolveSession } from './sessions.js';
import type { SessionRecord } from './sessions.js';

export interface OwnerContext {
  ownerId: string;
  sessionHash: string;
  kind: SessionKind;
  deviceId: string | null;
  session: SessionRecord;
}

declare module 'fastify' {
  interface FastifyRequest { owner?: OwnerContext }
}

/**
 * A bearer credential family keyed by its token prefix. The owner session (`dob_`) is registered here. Device tokens
 * (`ddt_`) are dispatched to `requireDevice` (auth/device-auth.ts) and are refused here with 403: a device credential
 * alone never grants owner rights. An unknown prefix always fails closed with 401.
 */
export type BearerResolver = (db: Db, rawToken: string, now: number) => OwnerContext | null;

const ownerBearer: BearerResolver = (db, raw, now) => {
  const session = resolveSession(db, raw, 'bearer', now);
  return session ? { ownerId: session.ownerId, sessionHash: session.sessionHash, kind: 'bearer', deviceId: session.deviceId, session } : null;
};

export const OWNER_BEARER_RESOLVERS: Readonly<Record<string, BearerResolver>> = { [OWNER_BEARER_PREFIX]: ownerBearer };

export type OwnerResolution =
  | { ok: true; owner: OwnerContext }
  | { ok: false; status: 400 | 401 | 403; message: string };

export interface OwnerAuthOptions {
  db: Db;
  now: () => number;
  /** Restrict to some credential kinds (default both). */
  kinds?: readonly SessionKind[];
}

/** Resolves the owner from the session cookie or an `Authorization: Bearer dob_...` header. Never reads the query string. */
export function resolveOwner(request: Pick<FastifyRequest, 'headers'>, options: OwnerAuthOptions): OwnerResolution {
  const credential = classifyCredential(request);
  if (credential.conflict || credential.duplicateSession) return { ok: false, status: 400, message: 'Send one credential type per request.' };
  const unauthorized: OwnerResolution = { ok: false, status: 401, message: 'Authentication is required.' };
  const allowed = options.kinds ?? ['cookie', 'bearer'];
  const now = options.now();
  if (credential.kind === 'cookie' && credential.sessionCookie !== undefined) {
    if (!allowed.includes('cookie')) return unauthorized;
    const session = resolveSession(options.db, credential.sessionCookie, 'cookie', now);
    return session ? { ok: true, owner: { ownerId: session.ownerId, sessionHash: session.sessionHash, kind: 'cookie', deviceId: null, session } } : unauthorized;
  }
  if (credential.kind === 'bearer' && credential.bearerToken !== undefined) {
    if (!allowed.includes('bearer')) return unauthorized;
    const token = credential.bearerToken;
    // A device credential never grants owner rights: say so (403) rather than pretending it is unknown (401).
    if (token.startsWith(DEVICE_TOKEN_PREFIX)) return { ok: false, status: 403, message: 'A device credential cannot perform owner actions.' };
    const prefix = Object.keys(OWNER_BEARER_RESOLVERS).find((p) => token.startsWith(p));
    const owner = prefix === undefined ? null : OWNER_BEARER_RESOLVERS[prefix]!(options.db, token, now);
    return owner ? { ok: true, owner } : unauthorized;
  }
  return unauthorized;
}

/** Fastify preHandler: 401 envelope unless an owner credential resolves; attaches `request.owner`. */
export function createRequireOwner(options: OwnerAuthOptions) {
  return async function requireOwner(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | undefined> {
    const result = resolveOwner(request, options);
    if (result.ok) {
      request.owner = result.owner;
      return undefined;
    }
    return reply
      .code(result.status)
      .type('application/json')
      .header('Cache-Control', 'no-store')
      .send(envelope(result.status === 400 ? 'bad-request' : result.status === 403 ? 'forbidden' : 'unauthorized', result.message));
  };
}
