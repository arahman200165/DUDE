import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseHubConfig } from '../config/hub-config.js';
import { audit } from '../security/audit.js';
import { setAuditIpMode } from '../security/address-privacy.js';
import { ALERT_LIMIT, ALERT_WINDOW_MS, isNewSignInAddress } from './routes/security-alerts.js';
import { startAuthHub } from './auth-test-helpers.js';
import type { AuthHub, Signed } from './auth-test-helpers.js';

const PUBLIC = 'https://hub.example.com';

describe('security alerts', () => {
  let h: AuthHub;
  beforeAll(async () => {
    h = await startAuthHub({ config: parseHubConfig({ exposure: { names: ['hub.example.com'], proxy: { trusted: ['127.0.0.1'], publicOrigin: PUBLIC } } }) });
  });
  afterAll(async () => { await h.close(); });

  const db = () => h.hub.hub.db;
  const from = (ip: string) => ({ headers: { origin: PUBLIC, host: `localhost:${h.hub.port}`, 'x-forwarded-for': ip, 'x-forwarded-host': 'hub.example.com', 'x-forwarded-proto': 'https' } });
  const signInFrom = async (ip: string): Promise<Signed> => {
    const res = await h.call('POST', '/auth/sign-in', { body: { password: 'a very long password' }, ...from(ip) });
    if (res.status !== 200) throw new Error(`sign-in ${res.status} ${res.raw.body}`);
    return { cookie: /__Host-dude_session=([^;]*)/.exec(res.setCookie ?? '')?.[1] ?? '', csrf: res.json.csrfToken, body: res.json, setCookie: res.setCookie!, res };
  };
  const list = (s: Signed) => h.call('GET', '/security/alerts', { cookie: s.cookie, ...from('203.0.113.50') });
  const detailOf = (seq: number) => JSON.parse((db().prepare('SELECT detail_json FROM audit_events WHERE seq = ?').get(seq) as { detail_json: string }).detail_json) as Record<string, unknown>;

  it('requires an owner credential', async () => {
    expect((await h.call('GET', '/security/alerts')).status).toBe(401);
    expect((await h.call('POST', '/security/alerts/seen', { body: { upToSeq: 1 } })).status).toBe(401);
  });

  it('flags a sign-in from a new address once, never loopback, and keeps details credential-free', async () => {
    const loopback = await h.signIn();
    const lastSignIn = () => db().prepare("SELECT seq FROM audit_events WHERE event = 'owner.sign-in' ORDER BY seq DESC LIMIT 1").get() as { seq: number };
    expect(detailOf(lastSignIn().seq).newAddress).toBe(false);
    expect(Object.keys(detailOf(lastSignIn().seq)).sort()).toEqual(['newAddress', 'sessionId']);

    const first = await signInFrom('203.0.113.50');
    const firstSeq = lastSignIn().seq;
    expect(detailOf(firstSeq).newAddress).toBe(true);
    await signInFrom('203.0.113.50');
    expect(detailOf(lastSignIn().seq).newAddress).toBe(false);

    const res = await list(first);
    expect(res.status).toBe(200);
    const signIns = res.json.alerts.filter((a: { event: string }) => a.event === 'owner.sign-in');
    expect(signIns).toHaveLength(1);
    expect(signIns[0]).toMatchObject({ seq: firstSeq, ip: '203.0.113.50', outcome: 'success', summary: 'Signed in from a new address.' });
    void loopback;
  });

  it('includes only the fixed event set, newest first, within the window', async () => {
    const now = h.clock.t;
    for (const event of ['throttle.locked', 'security.ip-blocked', 'owner.password-changed', 'device.revoked', 'device.revoked-attempt', 'tls.rotation-activated', 'network.address-changed', 'hub.started', 'device.renamed', 'owner.sign-out'] as const) {
      audit(db(), { event, outcome: 'success', actorKind: 'system', ip: '198.51.100.4', detail: event === 'throttle.locked' ? { kind: 'password', scope: 'address' } : event === 'network.address-changed' ? { added: ['203.0.113.9'], removed: [] } : {}, now });
    }
    audit(db(), { event: 'device.enrolled', outcome: 'success', actorKind: 'system', now: now - ALERT_WINDOW_MS - 1000 }); // too old
    const s = await signInFrom('203.0.113.50');
    const { alerts } = (await list(s)).json as { alerts: { seq: number; event: string; summary: string; ip: string | null }[] };
    const events = alerts.map((a) => a.event);
    expect(events).toEqual(expect.arrayContaining(['throttle.locked', 'security.ip-blocked', 'owner.password-changed', 'device.revoked', 'device.revoked-attempt', 'tls.rotation-activated']));
    expect(alerts.find((a) => a.event === 'device.revoked-attempt')?.summary).toBe('A revoked device tried to connect.');
    for (const excluded of ['hub.started', 'device.renamed', 'owner.sign-out', 'device.enrolled']) expect(events).not.toContain(excluded);
    expect(alerts.map((a) => a.seq)).toEqual([...alerts.map((a) => a.seq)].sort((a, b) => b - a));
    expect(alerts.find((a) => a.event === 'throttle.locked')?.summary).toMatch(/password/);
    expect(alerts.find((a) => a.event === 'network.address-changed')?.summary).toBe("This Hub's network addresses changed. 1 added, 0 removed.");
    expect(alerts.length).toBeLessThanOrEqual(ALERT_LIMIT);
  });

  it('tracks unseen against a monotonic seenSeq', async () => {
    const s = await signInFrom('203.0.113.50');
    const before = (await list(s)).json;
    expect(before.seenSeq).toBe(0);
    expect(before.unseen).toBe(before.alerts.length);
    expect(before.unseen).toBeGreaterThan(0);

    const top = before.alerts[0].seq as number;
    expect((await h.call('POST', '/security/alerts/seen', { cookie: s.cookie, csrf: s.csrf, body: { upToSeq: top }, ...from('203.0.113.50') })).json).toEqual({ ok: true });
    expect((await list(s)).json).toMatchObject({ seenSeq: top, unseen: 0 });

    await h.call('POST', '/security/alerts/seen', { cookie: s.cookie, csrf: s.csrf, body: { upToSeq: 1 }, ...from('203.0.113.50') });
    expect((await list(s)).json.seenSeq).toBe(top);

    audit(db(), { event: 'owner.recovery-code-used', outcome: 'success', actorKind: 'owner', now: h.clock.t });
    expect((await list(s)).json.unseen).toBe(1);

    const bad = await h.call('POST', '/security/alerts/seen', { cookie: s.cookie, csrf: s.csrf, body: { upToSeq: -1 }, ...from('203.0.113.50') });
    expect(bad.status).toBe(400);
  });

  it('compares the stored (masked) address when truncation is on', () => {
    expect(isNewSignInAddress(db(), '127.0.0.1', h.clock.t)).toBe(false);
    expect(isNewSignInAddress(db(), '::ffff:127.0.0.1', h.clock.t)).toBe(false);
    expect(isNewSignInAddress(db(), 'unknown', h.clock.t)).toBe(false);
    expect(isNewSignInAddress(db(), '192.0.2.200', h.clock.t)).toBe(true);
    setAuditIpMode(db(), 'truncated');
    audit(db(), { event: 'owner.sign-in', outcome: 'success', actorKind: 'owner', ip: '192.0.2.200', detail: { newAddress: true }, now: h.clock.t });
    expect(isNewSignInAddress(db(), '192.0.2.201', h.clock.t)).toBe(false); // same /24 once stored truncated
    setAuditIpMode(db(), 'full');
  });
});
