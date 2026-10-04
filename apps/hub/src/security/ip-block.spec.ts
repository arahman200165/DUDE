import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureLayout } from '../config/data-dir.js';
import { openHubDb } from '../db/open-hub-db.js';
import type { HubDb } from '../db/open-hub-db.js';
import { tempDir } from '../server/test-helpers.js';
import { listAudit } from './audit.js';
import {
  BLOCK_CREDENTIAL_FAILURES, BLOCK_FLOOD_HITS, BLOCK_WINDOW_MS, STRIKE_FORGET_MS, blockedForMs, clearBlock, isExemptAddress, listBlocks,
  noteCredentialFailure, noteFloodHit, registerIpBlock,
} from './ip-block.js';
import { createRateLimiter, registerRateLimit } from './rate-limit.js';
import { recordFailureKeys, throttleKeys } from './throttle.js';

const opened: HubDb[] = [];
const apps: FastifyInstance[] = [];
function open(): HubDb {
  const paths = ensureLayout(tempDir('hub-ipblock-'));
  const result = openHubDb({ dbFile: paths.dbFile, preMigrationDir: paths.preMigrationDir });
  if (result.status !== 'ready') throw new Error('not ready');
  opened.push(result.hub);
  return result.hub;
}
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const h of opened.splice(0)) { try { h.close(); } catch { /* already closed */ } }
});

const MIN = 60_000;
const IP = '203.0.113.9';
const fail = (hub: HubDb, ip: string, now: number, n: number): void => { for (let i = 0; i < n; i++) noteCredentialFailure(hub.db, ip, now); };

describe('automatic IP block', () => {
  it('blocks on the 25th failure, not the 24th', () => {
    const hub = open();
    fail(hub, IP, 1_000_000, BLOCK_CREDENTIAL_FAILURES - 1);
    expect(blockedForMs(hub.db, IP, 1_000_000)).toBe(0);
    fail(hub, IP, 1_000_000, 1);
    expect(blockedForMs(hub.db, IP, 1_000_000)).toBe(15 * MIN);
    expect(blockedForMs(hub.db, IP, 1_000_000 + 15 * MIN)).toBe(0);
    expect(listBlocks(hub.db, 1_000_000)).toMatchObject([{ ip: IP, strikes: 1, reason: 'credential-failures' }]);
    expect(listBlocks(hub.db, 1_000_000 + 16 * MIN)).toEqual([]);
    expect(hub.db.prepare('SELECT COUNT(*) AS n FROM throttle WHERE throttle_key LIKE ?').get('any-fail:ip:%')).toMatchObject({ n: 0 });
  });

  it('counts real credential failures through recordFailureKeys', () => {
    const hub = open();
    for (let i = 0; i < BLOCK_CREDENTIAL_FAILURES; i++) recordFailureKeys(hub.db, throttleKeys[i % 2 === 0 ? 'password' : 'recovery-code'](IP), 1_000_000);
    expect(blockedForMs(hub.db, IP, 1_000_000)).toBeGreaterThan(0);
  });

  it('blocks on the flood threshold', () => {
    const hub = open();
    for (let i = 0; i < BLOCK_FLOOD_HITS - 1; i++) noteFloodHit(hub.db, IP, 5_000);
    expect(blockedForMs(hub.db, IP, 5_000)).toBe(0);
    noteFloodHit(hub.db, IP, 5_000);
    expect(blockedForMs(hub.db, IP, 5_000)).toBe(15 * MIN);
    expect(listBlocks(hub.db, 5_000)[0]).toMatchObject({ reason: 'flood' });
  });

  it('never counts or blocks loopback and unknown addresses', () => {
    const hub = open();
    for (const ip of ['127.0.0.1', '127.9.9.9', '::1', '::ffff:127.0.0.1', 'unknown', '']) {
      expect(isExemptAddress(ip)).toBe(true);
      fail(hub, ip, 1_000, 40);
      for (let i = 0; i < 20; i++) noteFloodHit(hub.db, ip, 1_000);
      expect(blockedForMs(hub.db, ip, 1_000)).toBe(0);
    }
    expect(isExemptAddress('10.0.0.1')).toBe(false);
    expect(hub.db.prepare('SELECT COUNT(*) AS n FROM throttle').get()).toMatchObject({ n: 0 });
    expect(listAudit(hub.db)).toEqual([]);
  });

  it('escalates 15 min, 1 h, 6 h, 24 h and stays at 24 h', () => {
    const hub = open();
    let now = 1_000_000;
    const expected = [15 * MIN, 60 * MIN, 360 * MIN, 1440 * MIN, 1440 * MIN];
    for (const duration of expected) {
      fail(hub, IP, now, BLOCK_CREDENTIAL_FAILURES);
      expect(blockedForMs(hub.db, IP, now)).toBe(duration);
      now += duration + 1;
    }
    expect(hub.db.prepare('SELECT strikes FROM ip_blocks WHERE ip = ?').get(IP)).toMatchObject({ strikes: 5 });
  });

  it('forgets strikes after seven quiet days', () => {
    const hub = open();
    const now = 1_000_000;
    fail(hub, IP, now, BLOCK_CREDENTIAL_FAILURES); // strike 1, ends now+15m
    const later = now + 15 * MIN + STRIKE_FORGET_MS + 1;
    fail(hub, IP, later, BLOCK_CREDENTIAL_FAILURES);
    expect(hub.db.prepare('SELECT strikes FROM ip_blocks WHERE ip = ?').get(IP)).toMatchObject({ strikes: 1 });
    expect(blockedForMs(hub.db, IP, later)).toBe(15 * MIN);
  });

  it('restarts the count after the window passes', () => {
    const hub = open();
    fail(hub, IP, 1_000_000, BLOCK_CREDENTIAL_FAILURES - 1);
    fail(hub, IP, 1_000_000 + BLOCK_WINDOW_MS, 1);
    expect(blockedForMs(hub.db, IP, 1_000_000 + BLOCK_WINDOW_MS)).toBe(0);
    expect(hub.db.prepare('SELECT failures FROM throttle WHERE throttle_key = ?').get(`any-fail:ip:${IP}`)).toMatchObject({ failures: 1 });
  });

  it('clearBlock removes the block and counters and audits it', () => {
    const hub = open();
    fail(hub, IP, 1_000_000, BLOCK_CREDENTIAL_FAILURES);
    fail(hub, IP, 1_000_000, 3);
    expect(clearBlock(hub.db, IP, 1_000_100)).toBe(true);
    expect(blockedForMs(hub.db, IP, 1_000_100)).toBe(0);
    expect(hub.db.prepare('SELECT COUNT(*) AS n FROM throttle').get()).toMatchObject({ n: 0 });
    expect(clearBlock(hub.db, IP, 1_000_100)).toBe(false);
    const events = listAudit(hub.db).map((e) => e.event);
    expect(events).toContain('security.ip-unblocked');
    expect(events.filter((e) => e === 'security.ip-unblocked')).toHaveLength(1);
  });

  it('audits blocks without any credential material', () => {
    const hub = open();
    fail(hub, IP, 1_000_000, BLOCK_CREDENTIAL_FAILURES);
    const row = listAudit(hub.db).find((e) => e.event === 'security.ip-blocked');
    expect(row).toMatchObject({ outcome: 'denied', actorKind: 'system', ip: IP, detail: { reason: 'credential-failures', strikes: 1, minutes: 15 } });
    expect(Object.keys(row?.detail as object).sort()).toEqual(['minutes', 'reason', 'strikes']);
  });

  it('rejects API requests from a blocked address with 429 while static paths pass; loopback is never blocked', async () => {
    const hub = open();
    let now = 1_000_000;
    const app = Fastify();
    apps.push(app);
    registerIpBlock(app, hub.db, () => now);
    app.get('/api/v1/open', async () => ({ ok: true }));
    app.get('/index.html', async () => 'page');
    await app.ready();
    const get = (url: string, remoteAddress: string) => app.inject({ method: 'GET', url, remoteAddress });
    expect((await get('/api/v1/open', IP)).statusCode).toBe(200);
    fail(hub, IP, now, BLOCK_CREDENTIAL_FAILURES);
    const blocked = await get('/api/v1/open', IP);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['retry-after']).toBe(String(15 * 60));
    expect(blocked.headers['cache-control']).toBe('no-store');
    expect((await get('/index.html', IP)).statusCode).toBe(200);
    expect((await get('/api/v1/open', '127.0.0.1')).statusCode).toBe(200);
    expect((await get('/api/v1/open', '198.51.100.1')).statusCode).toBe(200);
    now += 15 * MIN;
    expect((await get('/api/v1/open', IP)).statusCode).toBe(200);
  });

  it('turns repeated flood-bucket rejections into a block', async () => {
    const hub = open();
    const now = (): number => 1_000_000;
    const limiter = createRateLimiter({ now, flood: { perMinute: 60, burst: 2 } });
    const app = Fastify();
    apps.push(app);
    registerIpBlock(app, hub.db, now);
    registerRateLimit(app, limiter, undefined, { onFlood: (ip) => noteFloodHit(hub.db, ip, now()) });
    app.get('/api/v1/open', async () => ({ ok: true }));
    await app.ready();
    const codes: number[] = [];
    for (let i = 0; i < 2 + BLOCK_FLOOD_HITS + 1; i++) codes.push((await app.inject({ method: 'GET', url: '/api/v1/open', remoteAddress: IP })).statusCode);
    expect(codes.slice(0, 2)).toEqual([200, 200]);
    expect(blockedForMs(hub.db, IP, now())).toBeGreaterThan(0);
    expect(codes.at(-1)).toBe(429);
    expect(listBlocks(hub.db, now())[0]).toMatchObject({ reason: 'flood' });
  });
});
