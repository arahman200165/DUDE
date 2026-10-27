import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { HubQueueStatusResponse } from '@dude/contracts/hub';
import { openQueueFixture } from '../queue/queue-fixture.js';
import { PASSWORD, startAuthHub } from './auth-test-helpers.js';
import type { AuthHub, Signed } from './auth-test-helpers.js';
import { enrolled } from './device-test-helpers.js';

/** `GET /api/v1/queue`: the owner's read-only view of the durable job queue (PD-147). */
describe('GET /queue', () => {
  const fixture = openQueueFixture();
  let h: AuthHub;
  let owner: Signed;
  beforeAll(async () => {
    h = await startAuthHub({ queue: { status: () => fixture.queue.status() } });
    owner = await h.signIn();
  });
  afterAll(async () => { await h.close(); fixture.close(); });

  it('reports counts, kinds and recent failures matching the contract, uncached', async () => {
    const done = fixture.queue.enqueue({ kind: 'noop.echo', payload: { note: 'private payload' } }).id;
    fixture.queue.claim('w');
    fixture.queue.complete(done, 'w', { summary: 'private result' });
    const dead = fixture.queue.enqueue({ kind: 'blobs.verify', maxAttempts: 1 }).id;
    fixture.queue.claim('w');
    fixture.queue.fail(dead, 'w', new Error('open C:\\Users\\ada\\file failed'));
    fixture.queue.enqueue({ kind: 'blobs.staging-sweep' });
    const res = await h.call('GET', '/queue', { cookie: owner.cookie });
    expect(res.status).toBe(200);
    expect(res.raw.headers['cache-control']).toBe('no-store');
    expect(Value.Check(HubQueueStatusResponse, res.json)).toBe(true);
    expect(res.json).toMatchObject({ available: true, counts: { queued: 1, running: 0, succeeded: 1, failed: 0, dead: 1 } });
    expect(res.json.recentFailures).toHaveLength(1);
    expect(res.json.recentFailures[0]).toMatchObject({ id: dead, kind: 'blobs.verify', state: 'dead' });
    expect(res.raw.body).not.toContain('private');
    expect(res.raw.body).not.toContain('ada');
  });

  it('is owner-only: anonymous is 401, a device token is refused, a bearer owner session works', async () => {
    expect((await h.call('GET', '/queue')).status).toBe(401);
    expect((await h.call('GET', '/queue', { cookie: 'not-a-session' })).status).toBe(401);
    const { token } = await enrolled(h, owner);
    expect((await h.call('GET', '/queue', { bearer: token, noOrigin: true })).status).toBe(403);
    const bearer = await h.call('POST', '/auth/owner/bearer', { bearer: token, noOrigin: true, body: { password: PASSWORD } });
    expect((await h.call('GET', '/queue', { bearer: bearer.json.accessToken as string, noOrigin: true })).status).toBe(200);
  });

  it('writes no audit event for a read, and has no mutating sibling', async () => {
    const count = () => Number((h.hub.hub.db.prepare('SELECT COUNT(*) AS n FROM audit_events').get() as { n: number }).n);
    const before = count();
    await h.call('GET', '/queue', { cookie: owner.cookie });
    expect(count()).toBe(before);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const res = await h.call(method, '/queue', { cookie: owner.cookie, csrf: owner.csrf, body: {} });
      expect(res.status, method).toBeGreaterThanOrEqual(400);
    }
  });
});

describe('GET /queue without SaveSphere storage', () => {
  it('reports the queue as unavailable with zero counts', async () => {
    const h = await startAuthHub();
    try {
      const owner = await h.signIn();
      const res = await h.call('GET', '/queue', { cookie: owner.cookie });
      expect(res.status).toBe(200);
      expect(Value.Check(HubQueueStatusResponse, res.json)).toBe(true);
      expect(res.json).toEqual({ available: false, counts: { queued: 0, running: 0, succeeded: 0, failed: 0, dead: 0 }, kinds: [], oldestQueuedAt: null, recentFailures: [] });
    } finally {
      await h.close();
    }
  });
});

