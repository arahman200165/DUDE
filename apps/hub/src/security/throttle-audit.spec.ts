import { afterEach, describe, expect, it } from 'vitest';
import { HUB_AUDIT_EVENTS } from '@dude/contracts/hub';
import { ensureLayout } from '../config/data-dir.js';
import { openHubDb } from '../db/open-hub-db.js';
import type { HubDb } from '../db/open-hub-db.js';
import { tempDir } from '../server/test-helpers.js';
import { AUDIT_MAX_ROWS, audit, listAudit, pruneAudit, sanitizeDetail } from './audit.js';
import { backoffMs, checkThrottle, checkThrottleKeys, recordFailure, recordFailureKeys, recordSuccess, throttleKeys } from './throttle.js';

const opened: HubDb[] = [];
function open(root = tempDir('hub-sec-')): { hub: HubDb; root: string } {
  const paths = ensureLayout(root);
  const result = openHubDb({ dbFile: paths.dbFile, preMigrationDir: paths.preMigrationDir });
  if (result.status !== 'ready') throw new Error('not ready');
  opened.push(result.hub);
  return { hub: result.hub, root };
}
afterEach(() => { for (const h of opened.splice(0)) { try { h.close(); } catch { /* already closed */ } } });

const MIN = 60_000;

describe('throttle', () => {
  it('allows 5 failures, then backs off 2s, 4s, 8s... capped at 15 minutes', () => {
    const { hub } = open();
    const db = hub.db;
    let now = 1_000_000;
    for (let i = 0; i < 5; i++) {
      expect(checkThrottle(db, 'k', now)).toEqual({ allowed: true });
      recordFailure(db, 'k', now);
      now += 100;
    }
    expect(checkThrottle(db, 'k', now)).toEqual({ allowed: true });
    expect([6, 7, 8, 9, 20, 100].map(backoffMs)).toEqual([2000, 4000, 8000, 16000, 900_000, 900_000]);

    recordFailure(db, 'k', now); // 6th
    const locked = checkThrottle(db, 'k', now);
    expect(locked).toEqual({ allowed: false, retryAfterMs: 2000 });
    expect(checkThrottle(db, 'k', now + 2000)).toEqual({ allowed: true });
    recordFailure(db, 'k', now + 2000); // 7th
    expect(checkThrottle(db, 'k', now + 2000)).toEqual({ allowed: false, retryAfterMs: 4000 });
  });

  it('resets after 15 minutes without failures, and on success', () => {
    const { hub } = open();
    const db = hub.db;
    let now = 1_000_000;
    for (let i = 0; i < 7; i++) recordFailure(db, 'k', now);
    expect(checkThrottle(db, 'k', now).allowed).toBe(false);
    now += 16 * MIN;
    expect(checkThrottle(db, 'k', now).allowed).toBe(true);
    recordFailure(db, 'k', now);
    expect(db.prepare('SELECT failures FROM throttle WHERE throttle_key = ?').get('k')).toMatchObject({ failures: 1 });
    for (let i = 0; i < 6; i++) recordFailure(db, 'k', now);
    expect(checkThrottle(db, 'k', now).allowed).toBe(false);
    recordSuccess(db, 'k');
    expect(checkThrottle(db, 'k', now).allowed).toBe(true);
  });

  it('survives a restart (reopened database)', () => {
    const first = open();
    const now = 5_000_000;
    for (let i = 0; i < 8; i++) recordFailure(first.hub.db, 'password:ip:1.2.3.4', now);
    first.hub.close();
    const second = open(first.root);
    const decision = checkThrottle(second.hub.db, 'password:ip:1.2.3.4', now + 1000);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.retryAfterMs).toBe(8000 - 1000);
  });

  it('builds per-IP and global keys for every kind and takes the longer wait', () => {
    const { hub } = open();
    const keys = throttleKeys['password']('9.9.9.9');
    expect(keys).toEqual({ ip: 'password:ip:9.9.9.9', global: 'password:global' });
    for (const kind of ['recovery-code', 'setup-token'] as const) {
      expect(throttleKeys[kind]('1.1.1.1').global).toBe(`${kind}:global`);
    }
    // Per-IP only: a failure flood from one address must not lock every device out.
    for (const kind of ['pairing', 'device-challenge'] as const) {
      expect(throttleKeys[kind]('1.1.1.1').global).toBeNull();
      const other = throttleKeys[kind]('2.2.2.2');
      for (let i = 0; i < 8; i++) recordFailureKeys(hub.db, throttleKeys[kind]('1.1.1.1'), 1_000);
      expect(checkThrottleKeys(hub.db, other, 1_000).allowed).toBe(true);
    }
    const now = 1_000_000;
    for (let i = 0; i < 6; i++) recordFailureKeys(hub.db, keys, now);
    expect(checkThrottleKeys(hub.db, throttleKeys['password']('8.8.8.8'), now).allowed).toBe(false); // global lock
    expect(checkThrottleKeys(hub.db, throttleKeys['pairing']('8.8.8.8'), now).allowed).toBe(true);
  });
});

describe('audit', () => {
  const base = { outcome: 'success', actorKind: 'system', now: 1_700_000_000_000 } as const;

  it('records and lists events newest first with pagination', () => {
    const { hub } = open();
    audit(hub.db, { ...base, event: 'hub.started', detail: { version: '1', port: 8443, tags: ['a', 'b'], nested: { ok: true } } });
    audit(hub.db, { ...base, event: 'auth.failure', outcome: 'failure', actorKind: 'anonymous', ip: '1.2.3.4' });
    audit(hub.db, { ...base, event: 'owner.sign-in', actorKind: 'owner', actorId: 'o1' });
    const all = listAudit(hub.db);
    expect(all.map((r) => r.event)).toEqual(['owner.sign-in', 'auth.failure', 'hub.started']);
    expect(all[2]!.detail).toEqual({ version: '1', port: 8443, tags: ['a', 'b'], nested: { ok: true } });
    expect(all[1]).toMatchObject({ outcome: 'failure', actorKind: 'anonymous', ip: '1.2.3.4' });
    expect(listAudit(hub.db, { beforeSeq: all[0]!.seq, limit: 1 }).map((r) => r.event)).toEqual(['auth.failure']);
    expect(listAudit(hub.db, { limit: 9999 })).toHaveLength(3);
  });

  it('has a closed event list and rejects unknown events', () => {
    const { hub } = open();
    expect(new Set(HUB_AUDIT_EVENTS).size).toBe(HUB_AUDIT_EVENTS.length);
    expect(() => audit(hub.db, { ...base, event: 'made.up' as never })).toThrow(/Unknown audit event/);
  });

  it('refuses credential-like keys at any depth', () => {
    for (const key of ['password', 'newPassword', 'secret', 'token', 'accessToken', 'recoveryCode', 'cookie', 'Authorization', 'apiKey', 'csrf']) {
      expect(() => sanitizeDetail({ [key]: 'x' }), key).toThrow(/credential/);
    }
    expect(() => sanitizeDetail({ a: { b: { token: 'x' } } })).toThrow(/credential/);
    expect(sanitizeDetail({ device: 'd1', reason: 'expired' })).toBe('{"device":"d1","reason":"expired"}');
  });

  it('refuses oversized, deep, non-plain and non-primitive detail', () => {
    expect(() => sanitizeDetail({ note: 'x'.repeat(3000) })).toThrow(/2 KiB/);
    expect(() => sanitizeDetail({ a: { b: { c: { d: 1 } } } })).toThrow(/deeply/);
    expect(() => sanitizeDetail([1, 2])).toThrow(/plain object/);
    expect(() => sanitizeDetail({ list: [{ a: 1 }] })).toThrow(/primitives/);
    expect(() => sanitizeDetail({ n: Number.NaN })).toThrow();
    expect(() => sanitizeDetail(new Date())).toThrow(/plain object/);
  });

  it('prunes by age (365 days) and by row count', () => {
    const { hub } = open();
    const now = Date.UTC(2026, 5, 1);
    const day = 24 * 3600_000;
    audit(hub.db, { ...base, event: 'hub.started', now: now - 400 * day });
    audit(hub.db, { ...base, event: 'hub.started', now: now - 364 * day });
    audit(hub.db, { ...base, event: 'hub.started', now });
    expect(pruneAudit(hub.db, now)).toBe(1);
    expect(listAudit(hub.db)).toHaveLength(2);

    for (let i = 0; i < 10; i++) audit(hub.db, { ...base, event: 'auth.failure', now });
    expect(listAudit(hub.db, { limit: 200 })).toHaveLength(12);
    expect(pruneAudit(hub.db, now, 5)).toBe(7);
    const kept = listAudit(hub.db, { limit: 200 });
    expect(kept).toHaveLength(5);
    expect(kept.every((r) => r.event === 'auth.failure')).toBe(true);
    expect(AUDIT_MAX_ROWS).toBe(100_000);
  });
});

