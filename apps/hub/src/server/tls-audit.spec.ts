import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTlsRotation } from '../tls/rotation.js';
import { spkiSha256 } from '../tls/self-signed.js';
import { startAuthHub } from './auth-test-helpers.js';
import type { AuthHub, Signed } from './auth-test-helpers.js';
import { enrolled } from './device-test-helpers.js';

describe('GET /tls/certificates and GET /audit', () => {
  let h: AuthHub;
  let owner: Signed;
  beforeAll(async () => {
    h = await startAuthHub();
    owner = await h.signIn();
  });
  afterAll(async () => { await h.close(); });

  it('returns the active certificate, then the staged next one; retired certificates are never returned', async () => {
    const before = await h.call('GET', '/tls/certificates', { noOrigin: true });
    expect(before.status).toBe(200);
    expect(before.raw.headers['cache-control']).toBe('no-store');
    expect(before.json.next).toBeNull();
    expect(before.json.active.spkiSha256).toBe(h.hub.tls.spkiSha256);
    expect(spkiSha256(before.json.active.certPem)).toBe(before.json.active.spkiSha256);

    const rotation = createTlsRotation({ db: h.hub.hub.db, tlsDir: h.hub.paths.tlsDir, hubInstanceId: h.hub.hub.hubInstanceId, now: () => h.clock.t });
    const staged = rotation.stage();
    const after = await h.call('GET', '/tls/certificates', { noOrigin: true });
    expect(after.json.active.spkiSha256).toBe(h.hub.tls.spkiSha256);
    expect(after.json.next.spkiSha256).toBe(staged.spkiSha256);
    expect(spkiSha256(after.json.next.certPem)).toBe(staged.spkiSha256);

    h.hub.hub.db.prepare("UPDATE tls_pins SET state = 'retired' WHERE state = 'next'").run();
    const retired = await h.call('GET', '/tls/certificates', { noOrigin: true });
    expect(retired.json.next).toBeNull();
    expect(retired.raw.body).not.toContain(staged.spkiSha256);
  });

  it('lists audit events newest first with pagination, for the owner only', async () => {
    expect((await h.call('GET', '/audit')).status).toBe(401);
    const all = await h.call('GET', '/audit', { cookie: owner.cookie });
    expect(all.status).toBe(200);
    expect(all.raw.headers['cache-control']).toBe('no-store');
    expect(all.json.events.some((e: { event: string }) => e.event === 'owner.sign-in')).toBe(true);
    const seqs = all.json.events.map((e: { seq: number }) => e.seq);
    expect([...seqs].sort((a, b) => b - a)).toEqual(seqs);
    expect(all.json.nextBeforeSeq).toBeNull();

    const page1 = await h.call('GET', '/audit?limit=2', { cookie: owner.cookie });
    expect(page1.json.events).toHaveLength(2);
    expect(page1.json.nextBeforeSeq).toBe(page1.json.events[1].seq);
    const page2 = await h.call('GET', `/audit?limit=2&beforeSeq=${page1.json.nextBeforeSeq}`, { cookie: owner.cookie });
    expect(page2.json.events[0].seq).toBeLessThan(page1.json.nextBeforeSeq);
    expect([...page1.json.events, ...page2.json.events].map((e: { seq: number }) => e.seq)).toEqual(seqs.slice(0, 4));

    expect((await h.call('GET', '/audit?limit=201', { cookie: owner.cookie })).json.events.length).toBeLessThanOrEqual(200);
    expect((await h.call('GET', '/audit?limit=0', { cookie: owner.cookie })).status).toBe(400);
  });

  it('never exposes credential-like detail keys and refuses device tokens', async () => {
    const all = await h.call('GET', '/audit?limit=200', { cookie: owner.cookie });
    const keys: string[] = [];
    const walk = (value: unknown): void => {
      if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { keys.push(k); walk(v); }
    };
    for (const e of all.json.events) walk(e.detail);
    expect(keys.filter((k) => /pass|secret|token|code|cookie|authorization|key|csrf/i.test(k))).toEqual([]);

    const { token } = await enrolled(h, owner);
    expect((await h.call('GET', '/audit', { bearer: token })).status).toBe(403);
  });
});
