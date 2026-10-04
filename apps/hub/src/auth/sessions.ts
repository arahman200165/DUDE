import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getMeta, setMeta, transaction } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import type { SessionInfo, SessionKind } from '@dude/contracts/hub';

export const HOUR_MS = 3600_000;
export const COOKIE_IDLE_MS = 12 * HOUR_MS;
export const COOKIE_ABSOLUTE_MS = 7 * 24 * HOUR_MS;
export const BEARER_IDLE_MS = 30 * 60_000;
export const BEARER_ABSOLUTE_MS = 12 * HOUR_MS;
/** The sliding idle expiry is written at most once per minute to limit database writes. */
export const SLIDE_MIN_INTERVAL_MS = 60_000;
export const USER_AGENT_MAX = 256;
/** A cookie session counts as freshly password-confirmed for this long after sign-in, recovery or a step-up. */
export const STEP_UP_WINDOW_MS = 5 * 60_000;
/** After a rotation the predecessor session keeps working this long, so in-flight requests and open sockets survive. */
export const ROTATION_GRACE_MS = 60_000;

/** Owner bearer sessions (the desktop Agent). Device tokens use `ddt_`. */
export const OWNER_BEARER_PREFIX = 'dob_';

export const SESSION_POLICY: Record<SessionKind, { idleMs: number; absoluteMs: number }> = {
  cookie: { idleMs: COOKIE_IDLE_MS, absoluteMs: COOKIE_ABSOLUTE_MS },
  bearer: { idleMs: BEARER_IDLE_MS, absoluteMs: BEARER_ABSOLUTE_MS },
};

const sha256Hex = (value: string): string => createHash('sha256').update(value).digest('hex');
const iso = (ms: number): string => new Date(ms).toISOString();

/** Only the SHA-256 of a session token is ever stored. */
export const hashSessionToken = (rawToken: string): string => sha256Hex(rawToken);
/** Public, non-secret handle for a session: the first 16 hex characters of its hash. */
export const publicSessionId = (sessionHash: string): string => sessionHash.slice(0, 16);

interface SessionRow {
  session_hash: string; owner_id: string; kind: SessionKind; device_id: string | null; csrf_hash: string | null;
  created_at: string; last_active_at: string; idle_expires_at: string; absolute_expires_at: string; revoked_at: string | null;
  user_agent: string | null; ip: string | null; stepped_up_at: string | null;
}

export interface SessionRecord {
  sessionHash: string;
  ownerId: string;
  kind: SessionKind;
  deviceId: string | null;
  createdAt: string;
  lastActiveAt: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
  userAgent: string | null;
  ip: string | null;
  /** When a cookie session last confirmed the password; null for bearer sessions. */
  steppedUpAt: string | null;
}

const COLUMNS = 'session_hash, owner_id, kind, device_id, csrf_hash, created_at, last_active_at, idle_expires_at, absolute_expires_at, revoked_at, user_agent, ip, stepped_up_at';

function toRecord(row: SessionRow): SessionRecord {
  return {
    sessionHash: row.session_hash, ownerId: row.owner_id, kind: row.kind, deviceId: row.device_id, createdAt: row.created_at,
    lastActiveAt: row.last_active_at, idleExpiresAt: row.idle_expires_at, absoluteExpiresAt: row.absolute_expires_at,
    userAgent: row.user_agent, ip: row.ip, steppedUpAt: row.stepped_up_at,
  };
}

/**
 * Whether the session recently proved the owner password. Bearer sessions are always stepped up: they are minted from a
 * password check (`POST /auth/owner-bearer`), are device-bound and live 30 minutes idle / 12 hours absolute. A cookie
 * session is stepped up for STEP_UP_WINDOW_MS after sign-in, recovery or `POST /auth/step-up`.
 */
export function isSteppedUp(record: SessionRecord, now: number): boolean {
  if (record.kind === 'bearer') return true;
  if (record.steppedUpAt === null) return false;
  const at = Date.parse(record.steppedUpAt);
  return Number.isFinite(at) && now - at < STEP_UP_WINDOW_MS;
}

export function toSessionInfo(record: SessionRecord, currentHash: string | undefined): SessionInfo {
  return {
    sessionId: publicSessionId(record.sessionHash), kind: record.kind, createdAt: record.createdAt, lastActiveAt: record.lastActiveAt,
    idleExpiresAt: record.idleExpiresAt, absoluteExpiresAt: record.absoluteExpiresAt, current: record.sessionHash === currentHash,
    userAgent: record.userAgent, ip: record.ip, deviceId: record.deviceId,
  };
}

/**
 * CSRF tokens are derived, not stored: `csrf = base64url(HMAC-SHA256(csrf_key, session_hash))`, where `csrf_key` is
 * 32 random bytes kept in `meta`. Only SHA-256(csrf) is stored in `sessions.csrf_hash` for verification, and a
 * session can be handed its token again by `GET /auth/session` without storing it in the clear. This is safe because
 * the token is only ever readable by same-origin JavaScript (no CORS headers, `Origin`/Fetch-Metadata are enforced,
 * the session cookie is SameSite=Strict and HttpOnly), and it is bound to one session. A database reader sees only
 * hashes, and without the cookie value (the preimage of the session hash) a CSRF token alone authenticates nothing.
 */
export function csrfKey(db: Db): Buffer {
  const existing = getMeta(db, 'csrf_key');
  if (existing) return Buffer.from(existing, 'base64');
  const key = randomBytes(32);
  setMeta(db, 'csrf_key', key.toString('base64'));
  return key;
}

export const deriveCsrfToken = (db: Db, sessionHash: string): string => createHmac('sha256', csrfKey(db)).update(sessionHash).digest('base64url');

export interface CreateSessionInput {
  ownerId: string;
  kind: SessionKind;
  /** Required for bearer sessions: they are bound to the device. */
  deviceId?: string;
  userAgent?: string | undefined;
  ip?: string | undefined;
  now: number;
}

export interface CreatedSession {
  /** The raw credential, returned once. Cookie: plain base64url. Bearer: `dob_` + base64url. */
  token: string;
  /** Present for cookie sessions only. */
  csrfToken: string | null;
  record: SessionRecord;
}

export function createSession(db: Db, input: CreateSessionInput): CreatedSession {
  if (input.kind === 'bearer' && !input.deviceId) throw new Error('A bearer session must be bound to a device.');
  const body = randomBytes(32).toString('base64url');
  const token = input.kind === 'bearer' ? `${OWNER_BEARER_PREFIX}${body}` : body;
  const sessionHash = hashSessionToken(token);
  const csrfToken = input.kind === 'cookie' ? deriveCsrfToken(db, sessionHash) : null;
  const policy = SESSION_POLICY[input.kind];
  const at = iso(input.now);
  const record: SessionRecord = {
    sessionHash, ownerId: input.ownerId, kind: input.kind, deviceId: input.kind === 'bearer' ? input.deviceId ?? null : null, createdAt: at,
    lastActiveAt: at, idleExpiresAt: iso(input.now + policy.idleMs), absoluteExpiresAt: iso(input.now + policy.absoluteMs),
    userAgent: input.userAgent ? input.userAgent.slice(0, USER_AGENT_MAX) : null, ip: input.ip ?? null,
    steppedUpAt: input.kind === 'cookie' ? at : null,
  };
  db.prepare(`INSERT INTO sessions(${COLUMNS}) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`).run(
    record.sessionHash, record.ownerId, record.kind, record.deviceId, csrfToken === null ? null : sha256Hex(csrfToken), record.createdAt,
    record.lastActiveAt, record.idleExpiresAt, record.absoluteExpiresAt, record.userAgent, record.ip, record.steppedUpAt,
  );
  return { token, csrfToken, record };
}

/**
 * Rotates a live cookie session on a privilege event: a new row (fresh token and CSRF) inherits everything session-specific
 * (owner, absolute expiry, browser binding), and the old row is pointed at it (`rotated_to`) and shortened to
 * ROTATION_GRACE_MS. The old row is not revoked and emits no event, so open requests and sockets finish; `sessionLive`
 * follows `rotated_to`. `opts.steppedUp` stamps the new row as freshly password-confirmed, otherwise the stamp carries over.
 */
export function rotateSession(db: Db, sessionHash: string, now: number, opts: { steppedUp?: boolean } = {}): CreatedSession | null {
  return transaction(db, () => {
    const old = liveRow(db, sessionHash, now);
    if (!old || old.kind !== 'cookie') return null;
    const token = randomBytes(32).toString('base64url');
    const newHash = hashSessionToken(token);
    const csrfToken = deriveCsrfToken(db, newHash);
    const at = iso(now);
    const idle = iso(Math.min(now + SESSION_POLICY.cookie.idleMs, Date.parse(old.absolute_expires_at)));
    const steppedUpAt = opts.steppedUp ? at : old.stepped_up_at;
    db.prepare(
      `INSERT INTO sessions(session_hash, owner_id, kind, device_id, csrf_hash, created_at, last_active_at, idle_expires_at, absolute_expires_at, revoked_at, user_agent, ip, stepped_up_at, browser_device_id)
       SELECT ?, owner_id, kind, device_id, ?, created_at, ?, ?, absolute_expires_at, NULL, user_agent, ip, ?, browser_device_id FROM sessions WHERE session_hash = ?`,
    ).run(newHash, sha256Hex(csrfToken), at, idle, steppedUpAt, old.session_hash);
    const graceEnd = now + ROTATION_GRACE_MS;
    db.prepare('UPDATE sessions SET rotated_to = ?, idle_expires_at = ?, absolute_expires_at = ? WHERE session_hash = ?').run(
      newHash, iso(Math.min(Date.parse(old.idle_expires_at), graceEnd)), iso(Math.min(Date.parse(old.absolute_expires_at), graceEnd)), old.session_hash,
    );
    const record: SessionRecord = {
      sessionHash: newHash, ownerId: old.owner_id, kind: 'cookie', deviceId: old.device_id, createdAt: old.created_at, lastActiveAt: at, idleExpiresAt: idle,
      absoluteExpiresAt: old.absolute_expires_at, userAgent: old.user_agent, ip: old.ip, steppedUpAt,
    };
    return { token, csrfToken, record };
  });
}

function liveRow(db: Db, sessionHash: string, now: number): SessionRow | undefined {
  const row = db.prepare(`SELECT ${COLUMNS} FROM sessions WHERE session_hash = ?`).get(sessionHash) as SessionRow | undefined;
  if (!row || row.revoked_at !== null) return undefined;
  if (Date.parse(row.idle_expires_at) <= now || Date.parse(row.absolute_expires_at) <= now) return undefined;
  return row;
}

/**
 * Resolves a raw token of the stated kind. Rejects unknown, revoked and expired sessions, a kind mismatch and a bearer
 * token without the `dob_` prefix. A hit slides the idle expiry (never past the absolute expiry) and records
 * `last_active_at`, at most once per minute.
 */
export function resolveSession(db: Db, rawToken: string, kind: SessionKind, now: number): SessionRecord | null {
  if (typeof rawToken !== 'string' || rawToken.length === 0 || rawToken.length > 512) return null;
  if (rawToken.startsWith(OWNER_BEARER_PREFIX) !== (kind === 'bearer')) return null;
  const row = liveRow(db, hashSessionToken(rawToken), now);
  if (!row || row.kind !== kind) return null;
  if (now - Date.parse(row.last_active_at) < SLIDE_MIN_INTERVAL_MS) return toRecord(row);
  const policy = SESSION_POLICY[kind];
  const idle = Math.min(now + policy.idleMs, Date.parse(row.absolute_expires_at));
  db.prepare('UPDATE sessions SET last_active_at = ?, idle_expires_at = ? WHERE session_hash = ? AND revoked_at IS NULL').run(iso(now), iso(idle), row.session_hash);
  return toRecord({ ...row, last_active_at: iso(now), idle_expires_at: iso(idle) });
}

export interface RevokedSession { sessionHash: string; sessionId: string; ownerId: string; kind: SessionKind; deviceId: string | null }

const revoked = (row: Pick<SessionRow, 'session_hash' | 'owner_id' | 'kind' | 'device_id'>): RevokedSession => ({
  sessionHash: row.session_hash, sessionId: publicSessionId(row.session_hash), ownerId: row.owner_id, kind: row.kind, deviceId: row.device_id,
});

/** Revokes one session by hash. Returns what was revoked, or null when it is unknown or already revoked. */
export function revokeSession(db: Db, sessionHash: string, now: number): RevokedSession | null {
  const row = db.prepare('SELECT session_hash, owner_id, kind, device_id FROM sessions WHERE session_hash = ? AND revoked_at IS NULL').get(sessionHash) as
    | Pick<SessionRow, 'session_hash' | 'owner_id' | 'kind' | 'device_id'> | undefined;
  if (!row) return null;
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE session_hash = ? AND revoked_at IS NULL').run(iso(now), sessionHash);
  return revoked(row);
}

/** Revokes every non-revoked session of the owner, optionally sparing one. Returns the revoked sessions. */
export function revokeAllSessions(db: Db, ownerId: string, exceptHash: string | undefined, now: number): RevokedSession[] {
  return transaction(db, () => {
    const rows = db
      .prepare('SELECT session_hash, owner_id, kind, device_id FROM sessions WHERE owner_id = ? AND revoked_at IS NULL AND session_hash <> ?')
      .all(ownerId, exceptHash ?? '') as unknown as Array<Pick<SessionRow, 'session_hash' | 'owner_id' | 'kind' | 'device_id'>>;
    const update = db.prepare('UPDATE sessions SET revoked_at = ? WHERE session_hash = ?');
    for (const row of rows) update.run(iso(now), row.session_hash);
    return rows.map(revoked);
  });
}

function activeRows(db: Db, ownerId: string, now: number): SessionRow[] {
  const rows = db.prepare(`SELECT ${COLUMNS} FROM sessions WHERE owner_id = ? AND revoked_at IS NULL ORDER BY created_at, session_hash`).all(ownerId) as unknown as SessionRow[];
  return rows.filter((r) => Date.parse(r.idle_expires_at) > now && Date.parse(r.absolute_expires_at) > now);
}

/** Active (non-revoked, unexpired) sessions with the public view only: hashes are never returned. */
export function listSessions(db: Db, ownerId: string, now: number, currentHash?: string): SessionInfo[] {
  return activeRows(db, ownerId, now).map((row) => toSessionInfo(toRecord(row), currentHash));
}

/** Hashes of the owner's active sessions other than `exceptHash`, sorted (for the revoke-all confirmation digest). */
export function otherActiveSessionHashes(db: Db, ownerId: string, exceptHash: string, now: number): string[] {
  return activeRows(db, ownerId, now).map((r) => r.session_hash).filter((h) => h !== exceptHash).sort();
}

/** Finds an active session of the owner by its public id. */
export function findSessionByPublicId(db: Db, ownerId: string, sessionId: string, now: number): SessionRecord | null {
  const row = activeRows(db, ownerId, now).find((r) => publicSessionId(r.session_hash) === sessionId);
  return row ? toRecord(row) : null;
}

export function getSessionRecord(db: Db, sessionHash: string, now: number): SessionRecord | null {
  const row = liveRow(db, sessionHash, now);
  return row ? toRecord(row) : null;
}

/** Verifies `X-DUDE-CSRF` against a cookie session: constant-time comparison of SHA-256(header) with `csrf_hash`. */
export function verifyCsrf(db: Db, cookieValue: string, header: string, now: number): boolean {
  if (typeof cookieValue !== 'string' || typeof header !== 'string' || cookieValue.length === 0 || header.length === 0 || header.length > 512) return false;
  const row = liveRow(db, hashSessionToken(cookieValue), now);
  if (!row || row.kind !== 'cookie' || row.csrf_hash === null) return false;
  const given = Buffer.from(sha256Hex(header), 'hex');
  const stored = Buffer.from(row.csrf_hash, 'hex');
  return given.length === stored.length && timingSafeEqual(given, stored);
}
