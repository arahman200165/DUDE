import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { transaction } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { INGEST_MAX_LIVE_TOKENS, INGEST_SCOPES, INGEST_TOKEN_PATTERN, INGEST_TOKEN_PREFIX, isIngestScope } from '@dude/contracts/hub';
import type { IngestScope, IngestTokenInfo } from '@dude/contracts/hub';
import { appendAuditOutbox, drainAuditOutbox } from '../savesphere-db/audit-outbox.js';
import type { AuditInput } from '../security/audit.js';
import { newId } from '../util/ids.js';

export { INGEST_TOKEN_PREFIX };

/** `last_used_at` is written at most this often per token, so a busy capture client does not turn every request into a write. */
export const INGEST_LAST_USED_GRANULARITY_MS = 60_000;
/** How many characters of the secret are kept for display (`dit_` plus six). */
export const INGEST_DISPLAY_PREFIX_LENGTH = INGEST_TOKEN_PREFIX.length + 6;
const DAY_MS = 24 * 3600_000;

/** Lower-case hex SHA-256 of the whole secret. The secret has 256 bits of entropy, so a plain hash is enough (as for `ddt_` device tokens). */
export const hashIngestToken = (secret: string): string => createHash('sha256').update(secret).digest('hex');

/** A new `dit_` secret: 32 random bytes as 43 base64url characters. */
export const generateIngestSecret = (): string => `${INGEST_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;

interface Row {
  id: string; label: string; token_hash: string; prefix: string; scopes_json: string;
  created_at: number; last_used_at: number | null; expires_at: number | null; revoked_at: number | null; created_by: string;
}

const iso = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString());

function scopesOf(json: string): IngestScope[] {
  try {
    const parsed: unknown = JSON.parse(json);
    // The list is closed: whatever else is stored (never written by this code) is dropped, so a token can only ever hold known scopes.
    return Array.isArray(parsed) ? parsed.filter((s): s is IngestScope => typeof s === 'string' && isIngestScope(s)) : [];
  } catch {
    return [];
  }
}

const stateOf = (row: Row, now: number): IngestTokenInfo['state'] =>
  row.revoked_at !== null ? 'revoked' : row.expires_at !== null && row.expires_at <= now ? 'expired' : 'active';

const toInfo = (row: Row, now: number): IngestTokenInfo => ({
  id: row.id, label: row.label, prefix: row.prefix, scopes: scopesOf(row.scopes_json), state: stateOf(row, now),
  createdAt: new Date(row.created_at).toISOString(), lastUsedAt: iso(row.last_used_at), expiresAt: iso(row.expires_at), revokedAt: iso(row.revoked_at),
});

export type IngestResolution =
  | { status: 'ok'; id: string; scopes: IngestScope[] }
  | { status: 'malformed' | 'unknown' }
  | { status: 'expired' | 'revoked'; id: string };

export interface IngestTokenStoreOptions {
  /** `savesphere.db`. */
  db: Db;
  /** `dude.db`'s audit writer (events travel through the `audit_outbox` of `savesphere.db`, then are drained into it). */
  hubDb: Db;
  auditWriter: (input: AuditInput) => void;
  now: () => number;
}

export type CreateResult = { status: 'created'; info: IngestTokenInfo; secret: string } | { status: 'limit' };
export type RevokeResult = { status: 'revoked'; info: IngestTokenInfo } | { status: 'not-found' | 'already-revoked' };

export interface IngestTokenStore {
  create(ownerId: string, input: { label: string; scopes: readonly IngestScope[]; expiresInDays?: number }): CreateResult;
  list(): IngestTokenInfo[];
  get(id: string): IngestTokenInfo | undefined;
  revoke(ownerId: string, id: string): RevokeResult;
  /** Hashed lookup, constant-time hash comparison, expiry and revocation checks; refreshes `last_used_at` (throttled) on success. */
  resolve(secret: string): IngestResolution;
}

/**
 * Ingest tokens in `savesphere.db` (32-SS1, Milestone 843). Only the SHA-256 of a secret is stored and the secret is returned exactly once,
 * from `create`. Creation and revocation write their audit event to the `audit_outbox` inside the same transaction and drain it after the
 * commit; no audit detail ever carries a secret or a hash.
 */
export function createIngestTokenStore(options: IngestTokenStoreOptions): IngestTokenStore {
  const { db, now } = options;
  const drain = (): void => {
    try { drainAuditOutbox(db, options.hubDb, options.auditWriter, now); } catch { /* retried by the next drain and by the start-up drain */ }
  };
  const byId = (id: string): Row | undefined => db.prepare('SELECT * FROM ingest_tokens WHERE id = ?').get(id) as Row | undefined;

  return {
    create(ownerId, input) {
      const at = now();
      const secret = generateIngestSecret();
      const id = newId(now);
      const scopes = INGEST_SCOPES.filter((scope) => input.scopes.includes(scope));
      const expiresAt = input.expiresInDays === undefined ? null : at + input.expiresInDays * DAY_MS;
      const created = transaction(db, () => {
        const live = (db.prepare('SELECT COUNT(*) AS n FROM ingest_tokens WHERE revoked_at IS NULL').get() as { n: number }).n;
        if (live >= INGEST_MAX_LIVE_TOKENS) return false;
        db.prepare(
          'INSERT INTO ingest_tokens(id, label, token_hash, prefix, scopes_json, created_at, last_used_at, expires_at, revoked_at, created_by) VALUES(?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?)',
        ).run(id, input.label, hashIngestToken(secret), secret.slice(0, INGEST_DISPLAY_PREFIX_LENGTH), JSON.stringify(scopes), at, expiresAt, ownerId);
        appendAuditOutbox(db, {
          event: 'ingest.token-created', actorKind: 'owner', actorId: ownerId, dedupeKey: `ingest.token-created:${id}`, now: at,
          detail: { ingestId: id, label: input.label, scopes, expiresAt: iso(expiresAt) },
        });
        return true;
      });
      if (!created) return { status: 'limit' };
      drain();
      return { status: 'created', info: toInfo(byId(id)!, at), secret };
    },

    list() {
      const at = now();
      return (db.prepare('SELECT * FROM ingest_tokens ORDER BY created_at DESC, id DESC').all() as unknown as Row[]).map((row) => toInfo(row, at));
    },

    get(id) {
      const row = byId(id);
      return row === undefined ? undefined : toInfo(row, now());
    },

    revoke(ownerId, id) {
      const at = now();
      const result = transaction(db, () => {
        const row = byId(id);
        if (row === undefined) return 'not-found' as const;
        if (row.revoked_at !== null) return 'already-revoked' as const;
        db.prepare('UPDATE ingest_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(at, id);
        appendAuditOutbox(db, {
          event: 'ingest.token-revoked', actorKind: 'owner', actorId: ownerId, dedupeKey: `ingest.token-revoked:${id}`, now: at,
          detail: { ingestId: id, label: row.label },
        });
        return 'revoked' as const;
      });
      if (result !== 'revoked') return { status: result };
      drain();
      return { status: 'revoked', info: toInfo(byId(id)!, at) };
    },

    resolve(secret) {
      if (typeof secret !== 'string' || !INGEST_TOKEN_PATTERN.test(secret)) return { status: 'malformed' };
      const at = now();
      const hash = hashIngestToken(secret);
      const row = db.prepare('SELECT * FROM ingest_tokens WHERE token_hash = ?').get(hash) as Row | undefined;
      // The index lookup is by the hash of the presented secret; the comparison below is constant-time regardless.
      if (row === undefined || !timingSafeEqual(Buffer.from(row.token_hash, 'hex'), Buffer.from(hash, 'hex'))) return { status: 'unknown' };
      if (row.revoked_at !== null) return { status: 'revoked', id: row.id };
      if (row.expires_at !== null && row.expires_at <= at) return { status: 'expired', id: row.id };
      if (row.last_used_at === null || at - row.last_used_at >= INGEST_LAST_USED_GRANULARITY_MS) {
        try { db.prepare('UPDATE ingest_tokens SET last_used_at = ? WHERE id = ?').run(at, row.id); } catch { /* a busy database never fails a capture */ }
      }
      return { status: 'ok', id: row.id, scopes: scopesOf(row.scopes_json) };
    },
  };
}
