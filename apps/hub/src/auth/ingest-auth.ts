import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Db } from '@dude/sqlite-store';
import { INGEST_TOKEN_PREFIX } from '@dude/contracts/hub';
import type { IngestScope } from '@dude/contracts/hub';
import type { IngestResolution, IngestTokenStore } from '../ingest/ingest-tokens.js';
import { audit } from '../security/audit.js';
import { noteCredentialFailure } from '../security/ip-block.js';
import { tooMany } from '../security/rate-limit.js';
import type { RateLimiter } from '../security/rate-limit.js';
import { envelope } from '../server/errors.js';

/**
 * The ingest credential family (32-SS1, Milestone 843, PD-119), keyed by token prefix like `OWNER_BEARER_RESOLVERS`, but it grants NO owner
 * access: a resolver returns the token's id and scopes and nothing else, and only `createRequireIngest` (routes under `/api/v1/ingest/`)
 * ever consults it. `OWNER_BEARER_RESOLVERS`, `requireDevice` and the WebSocket authenticators never do, so an ingest token presented
 * anywhere else is an unknown credential (401). 32-SS3 may add a second ingest prefix here; any other prefix fails closed.
 */
export type IngestResolver = (store: IngestTokenStore, rawToken: string) => IngestResolution;
export const INGEST_BEARER_RESOLVERS: Readonly<Record<string, IngestResolver>> = { [INGEST_TOKEN_PREFIX]: (store, raw) => store.resolve(raw) };

export interface IngestContext { tokenId: string; scopes: readonly IngestScope[] }

declare module 'fastify' {
  interface FastifyRequest { ingest?: IngestContext }
}

/** At most one `ingest.auth-failed` audit row per address per this long (the failure counters still count every attempt). */
export const INGEST_FAILURE_AUDIT_MIN_MS = 60_000;
const AUDIT_ADDRESSES_MAX = 1000;
const BEARER = /^Bearer\s+(\S+)\s*$/i;

export type IngestFailureReason = 'wrong-credential' | 'malformed' | 'unknown' | 'expired' | 'revoked' | 'unavailable' | 'scope';

export interface IngestAuthOptions {
  /** `undefined` while SaveSphere storage is not set up: every token is then unknown. */
  store: () => IngestTokenStore | undefined;
  /** `dude.db`: the failure counters of the automatic IP block and the audit log live there. */
  hubDb: Db;
  limiter: RateLimiter;
  now: () => number;
}

/**
 * Builds the preHandler factory for token-only routes. Reads ONLY the `Authorization` header: no cookie is read, so a session cookie is
 * never an authority here, and no owner or device credential is accepted (an `dob_` or `ddt_` bearer is a refusal like any wrong token).
 * Order: the per-address failure allowance (429 before anything is evaluated), the credential, the per-token bucket, the scope. A refusal
 * of a presented credential costs the address a failure token, counts toward the IP block like a failed login and is audited (throttled,
 * never with a token or hash). A request with no Authorization header at all is a plain 401 and counts for nothing.
 */
export function createRequireIngest(options: IngestAuthOptions) {
  const { hubDb, limiter, now } = options;
  const lastAudit = new Map<string, number>();

  const refuse = (reply: FastifyReply, ip: string, reason: IngestFailureReason, tokenId?: string): FastifyReply => {
    const at = now();
    limiter.noteIngestFailure(ip);
    try { noteCredentialFailure(hubDb, ip, at); } catch { /* counting never changes the answer */ }
    const previous = lastAudit.get(ip);
    if (previous === undefined || at - previous >= INGEST_FAILURE_AUDIT_MIN_MS) {
      if (lastAudit.size >= AUDIT_ADDRESSES_MAX) lastAudit.delete(lastAudit.keys().next().value as string);
      lastAudit.set(ip, at);
      try {
        audit(hubDb, { event: 'ingest.auth-failed', outcome: 'denied', actorKind: 'anonymous', ip, detail: { reason, ...(tokenId === undefined ? {} : { ingestId: tokenId }) }, now: at });
      } catch { /* the audit log never changes the answer */ }
    }
    return reply.code(401).type('application/json').header('Cache-Control', 'no-store').send(envelope('unauthorized', 'A valid ingest token is required.'));
  };

  return (scope: IngestScope) =>
    async function requireIngest(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | undefined> {
      const ip = request.ip || 'unknown';
      const wait = limiter.checkIngestAddress(ip);
      if (wait > 0) return tooMany(reply, wait);

      const authorization = request.headers.authorization;
      const token = typeof authorization === 'string' ? BEARER.exec(authorization)?.[1] : undefined;
      if (token === undefined) {
        return reply.code(401).type('application/json').header('Cache-Control', 'no-store').send(envelope('unauthorized', 'A valid ingest token is required.'));
      }
      const prefix = Object.keys(INGEST_BEARER_RESOLVERS).find((p) => token.startsWith(p));
      if (prefix === undefined) return refuse(reply, ip, 'wrong-credential');
      const store = options.store();
      if (store === undefined) return refuse(reply, ip, 'unavailable');
      const resolution = INGEST_BEARER_RESOLVERS[prefix]!(store, token);
      if (resolution.status !== 'ok') return refuse(reply, ip, resolution.status, 'id' in resolution ? resolution.id : undefined);

      const metered = limiter.checkIngestToken(resolution.id);
      if (metered > 0) return tooMany(reply, metered);
      if (!resolution.scopes.includes(scope)) {
        const at = now();
        const key = 'scope:' + resolution.id;
        const previous = lastAudit.get(key);
        if (previous === undefined || at - previous >= INGEST_FAILURE_AUDIT_MIN_MS) {
          lastAudit.set(key, at);
          try {
            audit(hubDb, { event: 'ingest.auth-failed', outcome: 'denied', actorKind: 'anonymous', ip, detail: { reason: 'scope' satisfies IngestFailureReason, ingestId: resolution.id, scope }, now: at });
          } catch { /* the audit log never changes the answer */ }
        }
        return reply.code(403).type('application/json').header('Cache-Control', 'no-store').send(envelope('forbidden', 'This ingest token does not have the required scope.'));
      }
      request.ingest = { tokenId: resolution.id, scopes: resolution.scopes };
      return undefined;
    };
}
