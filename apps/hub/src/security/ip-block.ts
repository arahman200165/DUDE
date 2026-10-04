import type { FastifyInstance } from 'fastify';
import type { Db } from '@dude/sqlite-store';
import { envelope } from '../server/errors.js';
import { audit } from './audit.js';
import { isApiPath } from './headers.js';

export const BLOCK_CREDENTIAL_FAILURES = 25;
export const BLOCK_FLOOD_HITS = 10;
export const BLOCK_WINDOW_MS = 15 * 60_000;
export const BLOCK_DURATIONS_MS: readonly number[] = [15 * 60_000, 60 * 60_000, 6 * 60 * 60_000, 24 * 60 * 60_000];
export const STRIKE_FORGET_MS = 7 * 24 * 60 * 60_000;

export type IpBlockReason = 'credential-failures' | 'flood';

const FAIL_PREFIX = 'any-fail:ip:';
const FLOOD_PREFIX = 'flood:ip:';

/** Loopback and unknown addresses are never counted or blocked (the local CLI, the desktop app and tests). */
export function isExemptAddress(ip: string | undefined): boolean {
  if (ip === undefined || ip === '' || ip === 'unknown') return true;
  const lower = ip.toLowerCase();
  if (lower === '::1') return true;
  const v4 = lower.startsWith('::ffff:') ? lower.slice(7) : lower;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v4);
}

interface BlockRow { strikes: number; blocked_until: string }

/** Remaining block time in ms; 0 when not blocked, expired or exempt. */
export function blockedForMs(db: Db, ip: string, now: number): number {
  if (isExemptAddress(ip)) return 0;
  const row = db.prepare('SELECT blocked_until FROM ip_blocks WHERE ip = ?').get(ip) as { blocked_until: string } | undefined;
  if (!row) return 0;
  return Math.max(0, Date.parse(row.blocked_until) - now);
}

function count(db: Db, key: string, now: number): number {
  const row = db.prepare('SELECT failures, window_started_at FROM throttle WHERE throttle_key = ?').get(key) as { failures: number; window_started_at: string } | undefined;
  const failures = row === undefined || now - Date.parse(row.window_started_at) >= BLOCK_WINDOW_MS ? 1 : row.failures + 1;
  db.prepare(
    `INSERT INTO throttle(throttle_key, failures, window_started_at, next_allowed_at) VALUES(?, ?, ?, NULL)
     ON CONFLICT(throttle_key) DO UPDATE SET failures = excluded.failures, window_started_at = excluded.window_started_at, next_allowed_at = NULL`,
  ).run(key, failures, new Date(now).toISOString());
  return failures;
}

function applyBlock(db: Db, ip: string, reason: IpBlockReason, counterKey: string, now: number): void {
  db.exec('BEGIN IMMEDIATE');
  try {
    const prior = db.prepare('SELECT strikes, blocked_until FROM ip_blocks WHERE ip = ?').get(ip) as BlockRow | undefined;
    const forgotten = prior === undefined || now - Date.parse(prior.blocked_until) > STRIKE_FORGET_MS;
    const strikes = forgotten ? 1 : prior.strikes + 1;
    const duration = BLOCK_DURATIONS_MS[Math.min(strikes - 1, BLOCK_DURATIONS_MS.length - 1)]!;
    const at = new Date(now).toISOString();
    db.prepare(
      `INSERT INTO ip_blocks(ip, strikes, blocked_until, reason, updated_at) VALUES(?, ?, ?, ?, ?)
       ON CONFLICT(ip) DO UPDATE SET strikes = excluded.strikes, blocked_until = excluded.blocked_until, reason = excluded.reason, updated_at = excluded.updated_at`,
    ).run(ip, strikes, new Date(now + duration).toISOString(), reason, at);
    db.prepare('DELETE FROM throttle WHERE throttle_key = ?').run(counterKey);
    audit(db, { event: 'security.ip-blocked', outcome: 'denied', actorKind: 'system', ip, detail: { reason, strikes, minutes: Math.round(duration / 60_000) }, now });
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    throw error;
  }
}

function note(db: Db, ip: string, prefix: string, threshold: number, reason: IpBlockReason, now: number): void {
  if (isExemptAddress(ip)) return;
  const key = `${prefix}${ip}`;
  if (count(db, key, now) >= threshold) applyBlock(db, ip, reason, key, now);
}

/** Any failed credential from this address (every kind counts toward one counter). */
export function noteCredentialFailure(db: Db, ip: string, now: number): void {
  note(db, ip, FAIL_PREFIX, BLOCK_CREDENTIAL_FAILURES, 'credential-failures', now);
}

/** The per-address flood bucket rejected a request. */
export function noteFloodHit(db: Db, ip: string, now: number): void {
  note(db, ip, FLOOD_PREFIX, BLOCK_FLOOD_HITS, 'flood', now);
}

export interface IpBlockInfo { ip: string; strikes: number; blockedUntil: string; reason: IpBlockReason }

export function listBlocks(db: Db, now: number): IpBlockInfo[] {
  const rows = db.prepare('SELECT ip, strikes, blocked_until, reason FROM ip_blocks WHERE blocked_until > ? ORDER BY blocked_until DESC')
    .all(new Date(now).toISOString()) as { ip: string; strikes: number; blocked_until: string; reason: IpBlockReason }[];
  return rows.map((r) => ({ ip: r.ip, strikes: r.strikes, blockedUntil: r.blocked_until, reason: r.reason }));
}

/** Removes the block row and counters for an address. Returns whether a block row existed. */
export function clearBlock(db: Db, ip: string, now: number): boolean {
  db.exec('BEGIN IMMEDIATE');
  try {
    const removed = db.prepare('DELETE FROM ip_blocks WHERE ip = ?').run(ip).changes > 0;
    db.prepare('DELETE FROM throttle WHERE throttle_key IN (?, ?)').run(`${FAIL_PREFIX}${ip}`, `${FLOOD_PREFIX}${ip}`);
    if (removed) audit(db, { event: 'security.ip-unblocked', outcome: 'success', actorKind: 'cli', ip, now });
    db.exec('COMMIT');
    return removed;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    throw error;
  }
}

/** Refuses API requests from a blocked address. Register BEFORE `registerRateLimit`. Static paths still pass. */
export function registerIpBlock(app: FastifyInstance, db: Db, now: () => number): void {
  app.addHook('onRequest', async (request, reply) => {
    if (!isApiPath(request.url)) return;
    const remaining = blockedForMs(db, request.ip || 'unknown', now());
    if (remaining <= 0) return;
    return reply
      .code(429)
      .type('application/json')
      .header('Retry-After', String(Math.max(1, Math.ceil(remaining / 1000))))
      .header('Cache-Control', 'no-store')
      .send(envelope('rate-limited', 'Too many failed attempts from this address. Try again later.'));
  });
}
