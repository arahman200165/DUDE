import type { FastifyReply } from 'fastify';
import type { Db } from '@dude/sqlite-store';
import { envelope } from '../server/errors.js';
import { audit } from './audit.js';
import { noteCredentialFailure } from './ip-block.js';

export const THROTTLE_FREE_FAILURES = 5;
export const THROTTLE_WINDOW_MS = 15 * 60_000;
export const THROTTLE_MAX_DELAY_MS = 15 * 60_000;

export const THROTTLE_KINDS = ['password', 'recovery-code', 'pairing', 'setup-token', 'device-challenge'] as const;
export type ThrottleKind = (typeof THROTTLE_KINDS)[number];

export interface ThrottleKeys {
  ip: string;
  global: string | null;
  /** The bare client address, for the automatic IP block counter. */
  address: string;
}

/**
 * Kinds without a global key. Device challenges are Ed25519 signatures (not guessable) and every pairing code
 * already dies after five wrong attempts, so a shared counter would only let a failure flood from anywhere lock
 * every device out of token refresh or enrollment.
 */
const PER_IP_ONLY: ReadonlySet<ThrottleKind> = new Set(['device-challenge', 'pairing']);

export const throttleKeys: Record<ThrottleKind, (ip: string) => ThrottleKeys> = Object.fromEntries(
  THROTTLE_KINDS.map((kind) => [kind, (ip: string): ThrottleKeys => ({ ip: `${kind}:ip:${ip}`, global: PER_IP_ONLY.has(kind) ? null : `${kind}:global`, address: ip })]),
) as Record<ThrottleKind, (ip: string) => ThrottleKeys>;

export type ThrottleDecision = { allowed: true } | { allowed: false; retryAfterMs: number };

interface Row { failures: number; window_started_at: string; next_allowed_at: string | null }

function readRow(db: Db, key: string): Row | undefined {
  return db.prepare('SELECT failures, window_started_at, next_allowed_at FROM throttle WHERE throttle_key = ?').get(key) as Row | undefined;
}

export function checkThrottle(db: Db, key: string, now: number): ThrottleDecision {
  const row = readRow(db, key);
  if (!row?.next_allowed_at) return { allowed: true };
  const next = Date.parse(row.next_allowed_at);
  return next > now ? { allowed: false, retryAfterMs: next - now } : { allowed: true };
}

/** Delay after the n-th failure: free up to 5, then 1 s * 2^(n-5), capped at 15 min. */
export function backoffMs(failures: number): number {
  if (failures <= THROTTLE_FREE_FAILURES) return 0;
  return Math.min(THROTTLE_MAX_DELAY_MS, 1000 * 2 ** Math.min(failures - THROTTLE_FREE_FAILURES, 30));
}

/**
 * `window_started_at` holds the time of the most recent failure; after 15 minutes without one (and once any
 * lockout has elapsed) the count restarts.
 */
export function recordFailure(db: Db, key: string, now: number): void {
  const row = readRow(db, key);
  const nextAllowed = row?.next_allowed_at ? Date.parse(row.next_allowed_at) : 0;
  const expired = row !== undefined && now - Date.parse(row.window_started_at) >= THROTTLE_WINDOW_MS && now >= nextAllowed;
  const failures = row === undefined || expired ? 1 : row.failures + 1;
  const delay = backoffMs(failures);
  db.prepare(
    `INSERT INTO throttle(throttle_key, failures, window_started_at, next_allowed_at) VALUES(?, ?, ?, ?)
     ON CONFLICT(throttle_key) DO UPDATE SET failures = excluded.failures, window_started_at = excluded.window_started_at, next_allowed_at = excluded.next_allowed_at`,
  ).run(key, failures, new Date(now).toISOString(), delay > 0 ? new Date(now + delay).toISOString() : null);
  if (delay > 0 && nextAllowed <= now) auditLockout(db, key, now);
}

/** One `throttle.locked` event when a key newly enters a lockout; the key names the kind and scope, never a credential. */
function auditLockout(db: Db, key: string, now: number): void {
  const kind = THROTTLE_KINDS.find((k) => key.startsWith(`${k}:`));
  if (kind === undefined) return;
  const rest = key.slice(kind.length + 1);
  const address = rest.startsWith('ip:') ? rest.slice(3) : undefined;
  if (address === undefined && rest !== 'global') return;
  audit(db, {
    event: 'throttle.locked', outcome: 'denied', actorKind: address === undefined ? 'system' : 'anonymous',
    ...(address !== undefined ? { ip: address } : {}), detail: { kind, scope: address === undefined ? 'global' : 'address' }, now,
  });
}

export function recordSuccess(db: Db, key: string): void {
  db.prepare('DELETE FROM throttle WHERE throttle_key = ?').run(key);
}

/** Longest wait across the per-IP and global keys. */
export function checkThrottleKeys(db: Db, keys: ThrottleKeys, now: number): ThrottleDecision {
  let wait = 0;
  for (const key of [keys.ip, keys.global]) {
    if (key === null) continue;
    const decision = checkThrottle(db, key, now);
    if (!decision.allowed) wait = Math.max(wait, decision.retryAfterMs);
  }
  return wait > 0 ? { allowed: false, retryAfterMs: wait } : { allowed: true };
}

export function recordFailureKeys(db: Db, keys: ThrottleKeys, now: number): void {
  recordFailure(db, keys.ip, now);
  if (keys.global !== null) recordFailure(db, keys.global, now);
  noteCredentialFailure(db, keys.address, now);
}

/** A success clears only the per-IP key; the global counter keeps its history. */
export function recordSuccessKeys(db: Db, keys: ThrottleKeys): void {
  recordSuccess(db, keys.ip);
}

export function lockedReply(reply: FastifyReply, retryAfterMs: number): FastifyReply {
  return reply
    .code(423)
    .type('application/json')
    .header('Retry-After', String(Math.max(1, Math.ceil(retryAfterMs / 1000))))
    .header('Cache-Control', 'no-store')
    .send(envelope('locked', 'Too many failed attempts. Try again later.'));
}
