import { afterEach, describe, expect, it } from 'vitest';
import { OIDC_FLOW_RETAIN_MS, OIDC_FLOW_TTL_MS, OIDC_MAX_ACTIVE_FLOWS } from './constants.js';
import { createOidcFlows, sanitizeReturnTo } from './flows.js';
import { OWNER_ID, T0, cleanOidcFixtures, openTestHubDb } from './oidc-fixture.js';
import { codeChallengeS256, sha256Hex } from './pkce.js';

afterEach(cleanOidcFixtures);

const setup = () => {
  const db = openTestHubDb();
  const clock = { now: T0 };
  const flows = createOidcFlows({ db, now: () => clock.now });
  return { db, clock, flows };
};

const row = (db: ReturnType<typeof openTestHubDb>, state: string) =>
  db.prepare('SELECT * FROM oidc_flows WHERE state_hash = ?').get(sha256Hex(state)) as Record<string, unknown> | undefined;

describe('starting a flow', () => {
  it('stores only hashes of state and nonce, and the verifier its challenge is derived from', () => {
    const { db, flows } = setup();
    const started = flows.start({ purpose: 'signin', returnTo: '/tools/json' });
    if (started.status !== 'ok') throw new Error('expected ok');
    const { state, nonce, codeChallenge } = started.flow;
    const stored = row(db, state)!;
    expect(stored).toMatchObject({ nonce_hash: sha256Hex(nonce), purpose: 'signin', owner_id: null, session_hash: null, return_to: '/tools/json', consumed_at: null });
    expect(codeChallengeS256(stored['code_verifier'] as string)).toBe(codeChallenge);
    expect(JSON.stringify(db.prepare('SELECT * FROM oidc_flows').all())).not.toContain(state);
    expect(JSON.stringify(db.prepare('SELECT * FROM oidc_flows').all())).not.toContain(nonce);
    expect(stored['expires_at']).toBe(new Date(T0 + OIDC_FLOW_TTL_MS).toISOString());
  });

  it('binds a link flow to the owner and the session that started it', () => {
    const { db, flows } = setup();
    const started = flows.start({ purpose: 'link', ownerId: OWNER_ID, sessionHash: 'session-hash-1' });
    if (started.status !== 'ok') throw new Error('expected ok');
    expect(row(db, started.flow.state)).toMatchObject({ purpose: 'link', owner_id: OWNER_ID, session_hash: 'session-hash-1' });
    const consumed = flows.consume(started.flow.state);
    expect(consumed).toMatchObject({ status: 'ok', flow: { purpose: 'link', ownerId: OWNER_ID, sessionHash: 'session-hash-1' } });
  });

  it('gives every flow its own state, nonce and verifier', () => {
    const { db, flows } = setup();
    const a = flows.start({ purpose: 'signin' });
    const b = flows.start({ purpose: 'signin' });
    if (a.status !== 'ok' || b.status !== 'ok') throw new Error('expected ok');
    expect(a.flow.state).not.toBe(b.flow.state);
    expect(a.flow.nonce).not.toBe(b.flow.nonce);
    expect(a.flow.codeChallenge).not.toBe(b.flow.codeChallenge);
    expect(db.prepare('SELECT COUNT(DISTINCT code_verifier) AS n FROM oidc_flows').get()).toEqual({ n: 2 });
  });

  it('bounds the number of live flows (an unauthenticated start must not fill the table) and recovers as they expire', () => {
    const { clock, flows } = setup();
    for (let i = 0; i < OIDC_MAX_ACTIVE_FLOWS; i += 1) expect(flows.start({ purpose: 'signin' }).status).toBe('ok');
    expect(flows.start({ purpose: 'signin' })).toEqual({ status: 'busy' });
    expect(flows.activeCount()).toBe(OIDC_MAX_ACTIVE_FLOWS);
    clock.now += OIDC_FLOW_TTL_MS + 1;
    expect(flows.start({ purpose: 'signin' }).status).toBe('ok');
  });
});

describe('consuming a flow', () => {
  it('is strictly single use: the second consume of the same state is refused', () => {
    const { flows } = setup();
    const started = flows.start({ purpose: 'signin' });
    if (started.status !== 'ok') throw new Error('expected ok');
    const first = flows.consume(started.flow.state);
    expect(first).toMatchObject({ status: 'ok', flow: { purpose: 'signin', nonceHash: sha256Hex(started.flow.nonce) } });
    expect(flows.consume(started.flow.state)).toEqual({ status: 'refused', reason: 'consumed' });
  });

  it('hands the verifier over once and clears it from the row at the same moment', () => {
    const { db, flows } = setup();
    const started = flows.start({ purpose: 'signin' });
    if (started.status !== 'ok') throw new Error('expected ok');
    const verifier = row(db, started.flow.state)!['code_verifier'] as string;
    const consumed = flows.consume(started.flow.state);
    if (consumed.status !== 'ok') throw new Error('expected ok');
    expect(consumed.flow.codeVerifier).toBe(verifier);
    expect(codeChallengeS256(consumed.flow.codeVerifier)).toBe(started.flow.codeChallenge);
    expect(row(db, started.flow.state)).toMatchObject({ code_verifier: '' });
    expect(row(db, started.flow.state)!['consumed_at']).toBe(new Date(T0).toISOString());
  });

  it('refuses an expired flow (at the expiry instant too) and leaves the verifier untouched for the sweep', () => {
    const { clock, flows } = setup();
    const started = flows.start({ purpose: 'signin' });
    if (started.status !== 'ok') throw new Error('expected ok');
    clock.now += OIDC_FLOW_TTL_MS;
    expect(flows.consume(started.flow.state)).toEqual({ status: 'refused', reason: 'expired' });
  });

  it('accepts a flow right up to the last millisecond before expiry', () => {
    const { clock, flows } = setup();
    const started = flows.start({ purpose: 'signin' });
    if (started.status !== 'ok') throw new Error('expected ok');
    clock.now += OIDC_FLOW_TTL_MS - 1;
    expect(flows.consume(started.flow.state).status).toBe('ok');
  });

  it('refuses an unknown state, and a malformed one before touching the database', () => {
    const { flows } = setup();
    expect(flows.consume('A'.repeat(43))).toEqual({ status: 'refused', reason: 'unknown' });
    for (const bad of [undefined, null, 7, '', 'short', 'a b', 'x'.repeat(500), "'; DROP TABLE oidc_flows;--"]) {
      expect(flows.consume(bad)).toEqual({ status: 'refused', reason: 'malformed' });
    }
  });

  it('one flow cannot be spent with another flow\'s state, nonce or hash', () => {
    const { flows } = setup();
    const a = flows.start({ purpose: 'signin' });
    const b = flows.start({ purpose: 'signin' });
    if (a.status !== 'ok' || b.status !== 'ok') throw new Error('expected ok');
    expect(flows.consume(a.flow.nonce)).toEqual({ status: 'refused', reason: 'unknown' }); // the nonce is not the state
    expect(flows.consume(sha256Hex(a.flow.state))).toMatchObject({ status: 'refused' }); // neither is its stored hash
    const spent = flows.consume(a.flow.state);
    if (spent.status !== 'ok') throw new Error('expected ok');
    expect(spent.flow.nonceHash).toBe(sha256Hex(a.flow.nonce));
    expect(spent.flow.nonceHash).not.toBe(sha256Hex(b.flow.nonce));
  });

  it('exactly one of two racing consumers wins (the update is guarded, not just the read)', () => {
    const { db, flows } = setup();
    const started = flows.start({ purpose: 'signin' });
    if (started.status !== 'ok') throw new Error('expected ok');
    // Simulate the loser reading the row before the winner's update: the guarded UPDATE changes nothing the second time.
    const hash = sha256Hex(started.flow.state);
    const update = "UPDATE oidc_flows SET consumed_at = ?, code_verifier = '' WHERE state_hash = ? AND consumed_at IS NULL AND expires_at > ?";
    const at = new Date(T0).toISOString();
    expect(Number(db.prepare(update).run(at, hash, at).changes)).toBe(1);
    expect(Number(db.prepare(update).run(at, hash, at).changes)).toBe(0);
    expect(flows.consume(started.flow.state)).toEqual({ status: 'refused', reason: 'consumed' });
  });
});

describe('sweeping', () => {
  it('deletes expired flows and spent ones after their retention, never a live one', () => {
    const { db, clock, flows } = setup();
    const live = flows.start({ purpose: 'signin' });
    const spent = flows.start({ purpose: 'signin' });
    const stale = flows.start({ purpose: 'signin' });
    if (live.status !== 'ok' || spent.status !== 'ok' || stale.status !== 'ok') throw new Error('expected ok');
    flows.consume(spent.flow.state);
    expect(flows.sweep()).toBe(0); // nothing is past retention yet
    clock.now += OIDC_FLOW_TTL_MS + OIDC_FLOW_RETAIN_MS + 1; // all three are now far past expiry
    expect(flows.sweep()).toBe(3);
    expect(db.prepare('SELECT COUNT(*) AS n FROM oidc_flows').get()).toEqual({ n: 0 });
    const fresh = flows.start({ purpose: 'signin' });
    if (fresh.status !== 'ok') throw new Error('expected ok');
    expect(flows.sweep()).toBe(0);
    expect(flows.consume(fresh.flow.state).status).toBe('ok');
  });

  it('keeps a recently expired flow long enough to tell an expiry from an unknown state', () => {
    const { clock, flows } = setup();
    const started = flows.start({ purpose: 'signin' });
    if (started.status !== 'ok') throw new Error('expected ok');
    clock.now += OIDC_FLOW_TTL_MS + 1000;
    flows.sweep();
    expect(flows.consume(started.flow.state)).toEqual({ status: 'refused', reason: 'expired' });
  });
});

describe('return_to', () => {
  it('keeps a same-site path and its query', () => {
    expect(sanitizeReturnTo('/')).toBe('/');
    expect(sanitizeReturnTo('/tools/json-formatter')).toBe('/tools/json-formatter');
    expect(sanitizeReturnTo('/settings?tab=security')).toBe('/settings?tab=security');
    expect(sanitizeReturnTo('/a/b/../c')).toBe('/a/c');
  });

  it('falls back to / for anything that could leave the site or reach the API', () => {
    const bad: unknown[] = [
      undefined, null, 5, '', 'tools', 'https://evil.example/', 'http://evil.example', '//evil.example', '///evil.example', '/\\evil.example', '\\\\evil.example',
      '/%2f%2fevil.example', '/%5cevil.example', 'javascript:alert(1)', '/ x', '/\nx', '/\tx', '/api/v1/devices', '/API/v1/devices', '/api', '/a/../api/v1/x',
      `/${'a'.repeat(600)}`, '/%E0%A4%A',
    ];
    for (const value of bad) expect([String(value), sanitizeReturnTo(value)]).toEqual([String(value), '/']);
  });

  it('is applied when a flow starts', () => {
    const { db, flows } = setup();
    const started = flows.start({ purpose: 'signin', returnTo: 'https://evil.example/phish' });
    if (started.status !== 'ok') throw new Error('expected ok');
    expect(row(db, started.flow.state)).toMatchObject({ return_to: '/' });
  });
});
