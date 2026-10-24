import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import * as encoding from 'lib0/encoding';
import Value from 'typebox/value';
import { WebSocket } from 'ws';
import { COLLAB_FRAME_AWARENESS, COLLAB_FRAME_SYNC, addSnippet, readSnippet } from '@dude/collab-doc';
import { COLLAB_MAX_FRAME_BYTES, CollabServerControl, HUB_REALTIME_PATH, REALTIME_CLOSE_CODES } from '@dude/contracts/hub';
import { connect, everySeen, refused, sleep, waitUntil, withClose } from './collab-test-helpers.js';
import type { Msg, Peer } from './collab-test-helpers.js';
import { startAuthHub } from '../server/auth-test-helpers.js';
import type { AuthHub, Signed } from '../server/auth-test-helpers.js';
import { enrolled } from '../server/device-test-helpers.js';
import { getCanonicalRecord } from '../db/canonical-repository.js';
import { listAudit } from '../security/audit.js';
import { getAuthorityEpoch, setAuthority } from '../hub/authority.js';

const HELLO = { type: 'hello', protocolVersion: 3, minHubProtocol: 1 };
const ALL_FLAGS = ['settings', 'favorites', 'pipelines', 'projects', 'workspaces', 'home', 'usage', 'workspace-layout', 'scratchpad'];
const flags = (over: Record<string, boolean> = {}): Record<string, boolean> => ({ ...Object.fromEntries(ALL_FLAGS.map((k) => [k, true])), ...over });

describe('collaboration socket (/api/v1/collab)', () => {
  let h: AuthHub;
  let owner: Signed;
  const peers: Peer[] = [];
  const track = (p: Peer): Peer => { peers.push(p); return p; };

  beforeAll(async () => {
    h = await startAuthHub({
      collab: { idleUnloadMs: 50, materializer: { quietMs: 20, maxWaitMs: 100, retryMs: 50 }, store: { flushMs: 20 } },
      collabSocket: { helloTimeoutMs: 400, rateLimit: { max: 60, windowMs: 10_000 } },
    });
    owner = await h.signIn();
  });
  // Every test starts with no open collaboration sockets, so subscriber counts are exact.
  afterEach(async () => {
    for (const p of peers.splice(0)) p.destroy();
    await waitUntil(() => h.hub.app.collabSockets.connectionCount() === 0);
  });
  afterAll(async () => {
    for (const p of peers) p.destroy();
    await h.close();
  });

  const db = () => h.hub.hub.db;
  const ownerHeaders = (s: Signed = owner): Record<string, string> => ({ cookie: `__Host-dude_session=${s.cookie}`, origin: `https://127.0.0.1:${h.hub.port}` });
  const bearerHeaders = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}` });
  const asOwner = (s: Signed = owner) => ({ cookie: s.cookie, csrf: s.csrf });

  async function welcomed(headers: Record<string, string>): Promise<{ peer: Peer; welcome: Msg }> {
    const peer = track(await connect(h, headers));
    peer.send(HELLO);
    return { peer, welcome: await peer.next((m) => m.type === 'welcome') };
  }

  /** A new desktop device that reported its sync state (the Hub's evidence of consent, PD-103). */
  async function device(over: { flags?: Record<string, boolean>; lastSyncAt?: string | null; report?: boolean; name?: string } = {}): Promise<{ id: string; token: string }> {
    const e = await enrolled(h, owner, undefined, over.name ? { displayName: over.name } : undefined);
    const result = { id: e.device.deviceId, token: e.token };
    if (over.report !== false) await report(result, over.flags ?? flags(), over.lastSyncAt === undefined ? '2026-03-01T00:00:00.000Z' : over.lastSyncAt);
    return result;
  }
  const report = async (d: { token: string }, categories: Record<string, boolean>, lastSyncAt: string | null = '2026-03-01T00:00:00.000Z'): Promise<void> => {
    const res = await h.call('PUT', '/sync/state', { bearer: d.token, body: { cursor: 0, pending: 0, quarantined: 0, conflicts: 0, stranded: 0, categories, lastSyncAt } });
    expect(res.status).toBe(200);
  };
  const setWebAccess = async (category: string, enabled: boolean, s: Signed = owner): Promise<void> => {
    expect((await h.call('PUT', '/web/access', { ...asOwner(s), body: { category, enabled } })).status).toBe(200);
  };
  const envId = (): string => (db().prepare('SELECT environment_id FROM environment LIMIT 1').get() as { environment_id: string }).environment_id;
  const snippet = (id: string, body = 'body') => ({ id, title: `title ${id}`, body, createdAt: '2026-03-01T00:00:00.000Z' });
  const frameAwareness = (clientId: number, json: unknown, clock = 1): Uint8Array => {
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, 1);
    encoding.writeVarUint(e, clientId);
    encoding.writeVarUint(e, clock);
    encoding.writeVarString(e, JSON.stringify(json));
    return encoding.toUint8Array(e);
  };

  it('refuses an unauthenticated upgrade before any WebSocket exists, and audits a revoked device token as a collab attempt', async () => {
    expect(await refused(h, {})).toBe(401);
    expect(await refused(h, bearerHeaders('nonsense'))).toBe(401);
    expect(await refused(h, bearerHeaders(`ddt_${'A'.repeat(43)}`))).toBe(401);
    expect(await refused(h, bearerHeaders(`dob_${'A'.repeat(43)}`))).toBe(401);
    const cookie = `__Host-dude_session=${owner.cookie}`;
    expect(await refused(h, { cookie })).toBe(401);
    expect(await refused(h, { cookie, origin: 'https://evil.example' })).toBe(401);

    const gone = await device({ report: false });
    const preview = await h.call('POST', `/devices/${gone.id}/revoke/preview`, asOwner());
    expect((await h.call('POST', `/devices/${gone.id}/revoke`, { ...asOwner(), body: { confirmToken: preview.json.confirmToken } })).status).toBe(200);
    expect(await refused(h, bearerHeaders(gone.token))).toBe(401);
    const attempts = listAudit(db()).filter((r) => r.event === 'device.revoked-attempt' && r.actorId === gone.id);
    expect(attempts.map((r) => r.detail)).toEqual([{ via: 'collab' }]);
  });

  it('negotiates hello: a welcome with the stamped identity, protocol 3 only, hello required first', async () => {
    const d = await device({ name: 'Studio PC' });
    const { welcome } = await welcomed(bearerHeaders(d.token));
    expect(welcome).toMatchObject({ type: 'welcome', protocolVersion: 3, sessionKind: 'device', deviceId: d.id });
    expect(welcome.identity).toMatchObject({ deviceId: d.id, name: 'Studio PC' });
    expect(welcome.identity.colorSlot).toBeGreaterThanOrEqual(0);
    expect(welcome.identity.colorSlot).toBeLessThan(8);
    expect(Value.Check(CollabServerControl, welcome)).toBe(true);

    const cookie = await welcomed(ownerHeaders());
    expect(cookie.welcome).toMatchObject({ sessionKind: 'owner-cookie', deviceId: null });
    expect(typeof cookie.welcome.identity.deviceId).toBe('string');

    const old = track(await connect(h, bearerHeaders(d.token)));
    old.send({ type: 'hello', protocolVersion: 1, minHubProtocol: 1 });
    expect(await old.next((m) => m.type === 'error')).toEqual({ type: 'error', code: 'unsupported-protocol' });
    expect(await withClose(old)).toBe(REALTIME_CLOSE_CODES.unsupportedProtocol);

    const eager = track(await connect(h, bearerHeaders(d.token)));
    eager.send({ type: 'subscribe', channel: 1, doc: 'scratchpad:default' });
    expect(await withClose(eager)).toBe(REALTIME_CLOSE_CODES.protocolError);

    const silent = track(await connect(h, bearerHeaders(d.token)));
    expect(await withClose(silent)).toBe(REALTIME_CLOSE_CODES.protocolError);
  });

  it('closes on malformed, oversized and unknown-channel input with 4010', async () => {
    const d = await device();
    const bad = async (act: (p: Peer) => void): Promise<number> => {
      const { peer } = await welcomed(bearerHeaders(d.token));
      act(peer);
      return withClose(peer);
    };
    expect(await bad((p) => p.send('not json'))).toBe(4010);
    expect(await bad((p) => p.send({ type: 'subscribe', channel: 9, doc: 'scratchpad:default' }))).toBe(4010);
    expect(await bad((p) => p.send({ type: 'subscribe', channel: 1, doc: 'nonsense' }))).toBe(4010);
    expect(await bad((p) => p.send({ type: 'heartbeat', extra: 'x'.repeat(5000) }))).toBe(4010);
    expect(await bad((p) => p.ws.send(new Uint8Array([1, 2, 3])))).toBe(4010);
    expect(await bad((p) => p.sendFrame(3, COLLAB_FRAME_SYNC, new Uint8Array([0])))).toBe(4010);
    // A frame over the collaboration cap is refused by the transport itself (1009, or 1006 when the socket is torn down first).
    expect([1006, 1009]).toContain(await bad((p) => p.sendFrame(1, COLLAB_FRAME_SYNC, new Uint8Array(COLLAB_MAX_FRAME_BYTES + 1))));
  });

  it('two devices co-edit scratchpad:default, converge, and the record materializes', async () => {
    const a = await device({ name: 'Laptop' });
    const b = await device({ name: 'Desktop' });
    const pa = (await welcomed(bearerHeaders(a.token))).peer;
    const pb = (await welcomed(bearerHeaders(b.token))).peer;
    expect((await pa.join(1, 'scratchpad:default')).type).toBe('subscribed');
    expect((await pb.join(2, 'scratchpad:default')).type).toBe('subscribed');
    const da = pa.channels.get(1)!.doc;
    const dbb = pb.channels.get(2)!.doc;

    addSnippet(da, snippet('s1', 'from a'));
    addSnippet(dbb, snippet('s2', 'from b'));
    expect(await waitUntil(() => readSnippet(da, 's2') !== null && readSnippet(dbb, 's1') !== null)).toBe(true);
    expect(readSnippet(da, 's2')?.body).toBe('from b');
    expect(readSnippet(dbb, 's1')?.body).toBe('from a');

    const materialized = async (): Promise<boolean> => {
      const record = getCanonicalRecord(db(), envId(), 'scratchpad', 'default');
      const snippets = (record?.payload as { snippets?: Array<{ id: string }> } | undefined)?.snippets ?? [];
      return snippets.map((s) => s.id).sort().join() === 's1,s2';
    };
    expect(await waitUntil(materialized, 4000)).toBe(true);
    expect(getCanonicalRecord(db(), envId(), 'scratchpad', 'default')?.updatedByDeviceId).toMatch(new RegExp(`${a.id}|${b.id}`));
    expect(h.hub.app.collabSockets.subscriberCount('scratchpad:default')).toBe(2);

    // Unsubscribing releases the document; the other side keeps editing.
    pa.send({ type: 'unsubscribe', channel: 1 });
    expect(await waitUntil(() => h.hub.app.collabSockets.subscriberCount('scratchpad:default') === 1)).toBe(true);
    addSnippet(dbb, snippet('s3', 'after'));
    expect(await waitUntil(async () => {
      const snippets = (getCanonicalRecord(db(), envId(), 'scratchpad', 'default')?.payload as { snippets: Array<{ id: string }> }).snippets;
      return snippets.some((s) => s.id === 's3');
    }, 4000)).toBe(true);
    pa.destroy();
    pb.destroy();
    expect(await waitUntil(() => h.hub.app.collabSockets.subscriberCount('scratchpad:default') === 0)).toBe(true);
  });

  it('device consent: the category in its reported map and a completed first sync', async () => {
    const without = await device({ flags: flags({ scratchpad: false }) });
    const never = await device({ report: false });
    const unsynced = await device({ lastSyncAt: null });
    const ok = await device();
    const expectCode = async (d: { token: string }, doc: string, code: string): Promise<void> => {
      const { peer } = await welcomed(bearerHeaders(d.token));
      expect(await peer.join(1, doc)).toMatchObject({ type: 'doc-error', channel: 1, code });
      expect(h.hub.app.collabSockets.subscriberCount(doc)).toBe(0);
    };
    await expectCode(without, 'scratchpad:default', 'consent-required');
    await expectCode(never, 'scratchpad:default', 'consent-required');
    await expectCode(unsynced, 'scratchpad:default', 'consent-required');
    // user-script needs `pipelines`, markdown-doc needs `collab-documents` (off unless reported on).
    await expectCode(ok, 'markdown-doc:nothing', 'consent-required');
    const pipelinesOff = await device({ flags: flags({ pipelines: false }) });
    await expectCode(pipelinesOff, 'user-script:u1', 'consent-required');
    // Consent first, then existence: a consented device asking for a record that is not there.
    const docs = await device({ flags: flags({ 'collab-documents': true }) });
    await expectCode(docs, 'markdown-doc:nothing', 'not-found');
    await expectCode(docs, 'user-script:u1', 'not-found');
    // The scratchpad is a singleton that may not be synced yet: it opens empty.
    const { peer } = await welcomed(bearerHeaders(ok.token));
    expect((await peer.join(1, 'scratchpad:default')).type).toBe('subscribed');
    // The scratchpad is a singleton: any other id is not a document.
    expect(await peer.join(3, 'scratchpad:other')).toMatchObject({ type: 'doc-error', code: 'not-found' });
    // A second subscription to the same document, or to a used channel, is a limit.
    expect(await peer.join(2, 'scratchpad:default')).toMatchObject({ type: 'doc-error', code: 'limit' });
    expect(await peer.join(1, 'user-script:u1')).toMatchObject({ type: 'doc-error', code: 'limit' });
  });

  it('web consent: the owner cookie needs the environment web-access toggle; an owner bearer follows its bound device', async () => {
    await setWebAccess('scratchpad', false);
    const cookie = (await welcomed(ownerHeaders())).peer;
    expect(await cookie.join(1, 'scratchpad:default')).toMatchObject({ type: 'doc-error', code: 'consent-required' });
    await setWebAccess('scratchpad', true);
    expect((await cookie.join(1, 'scratchpad:default')).type).toBe('subscribed');

    // An owner bearer bound to a device that has not consented gets nothing; once the device reports it, the subscription opens.
    const d = await device({ flags: flags({ scratchpad: false }) });
    const bearer = (await h.call('POST', '/auth/owner/bearer', { bearer: d.token, body: { password: 'a very long password' } })).json.accessToken as string;
    const { peer: bp, welcome } = await welcomed(bearerHeaders(bearer));
    expect(welcome).toMatchObject({ sessionKind: 'owner-bearer', identity: { deviceId: d.id } });
    expect(await bp.join(1, 'scratchpad:default')).toMatchObject({ type: 'doc-error', code: 'consent-required' });
    await report(d, flags());
    expect((await bp.join(1, 'scratchpad:default')).type).toBe('subscribed');
    await report(d, flags({ scratchpad: false }));
    expect(await bp.next((m) => m.type === 'doc-error' && m.code === 'consent-revoked' && m.channel === 1)).toBeDefined();
  });

  it('turning consent off ends the subscription with consent-revoked, drops late frames, and keeps the socket', async () => {
    await setWebAccess('scratchpad', true);
    const { peer } = await welcomed(ownerHeaders());
    expect((await peer.join(1, 'scratchpad:default')).type).toBe('subscribed');
    await setWebAccess('scratchpad', false);
    expect(await peer.next((m) => m.type === 'doc-error' && m.code === 'consent-revoked')).toMatchObject({ channel: 1 });
    expect(h.hub.app.collabSockets.subscriberCount('scratchpad:default')).toBe(0);
    // A frame the client sent before it heard about it is dropped, not a protocol error.
    addSnippet(peer.channels.get(1)!.doc, snippet('late'));
    await sleep(150);
    expect(peer.ws.readyState).toBe(peer.ws.OPEN);
    expect(await peer.join(1, 'scratchpad:default')).toMatchObject({ type: 'doc-error', code: 'consent-required' });

    const d = await device();
    const dp = (await welcomed(bearerHeaders(d.token))).peer;
    expect((await dp.join(1, 'scratchpad:default')).type).toBe('subscribed');
    await report(d, flags({ scratchpad: false }));
    expect(await dp.next((m) => m.type === 'doc-error' && m.code === 'consent-revoked')).toMatchObject({ channel: 1 });
    await setWebAccess('scratchpad', true);
  });

  it('rewrites every awareness identity from the principal and ignores spoofed, malformed and hijacking updates', async () => {
    const created = await h.call('POST', '/collab/rooms', { ...asOwner(), body: { name: 'Spoof' } });
    expect(created.status).toBe(201);
    const room = `room:${created.json.id as string}`;
    const a = await device({ name: 'Alice PC' });
    const pa = (await welcomed(bearerHeaders(a.token))).peer;
    const pb = (await welcomed(ownerHeaders())).peer;
    expect((await pa.join(1, room)).type).toBe('subscribed');
    expect((await pb.join(1, room)).type).toBe('subscribed');
    const aa = pa.channels.get(1)!.awareness;
    const bb = pb.channels.get(1)!.awareness;

    // Extra fields: the entry is dropped, nobody sees it.
    aa.setLocalState({ user: { deviceId: 'spoofed', name: 'Mallory', colorSlot: 7 }, cursor: null, evil: true });
    await sleep(120);
    expect(bb.getStates().has(aa.clientID)).toBe(false);

    aa.setLocalState({ user: { deviceId: 'spoofed', name: 'Mallory', colorSlot: 7 }, cursor: null });
    expect(await waitUntil(() => bb.getStates().has(aa.clientID))).toBe(true);
    const seen = bb.getStates().get(aa.clientID) as { user: { deviceId: string; name: string; colorSlot: number }; cursor: unknown };
    expect(seen.user).toMatchObject({ deviceId: a.id, name: 'Alice PC' });
    expect(seen.user.colorSlot).toBeLessThan(8);
    expect(seen.cursor).toBeNull();

    // B cannot overwrite A's presence by reusing its client id.
    pb.sendFrame(1, COLLAB_FRAME_AWARENESS, frameAwareness(aa.clientID, { user: { deviceId: 'x', name: 'x', colorSlot: 0 }, cursor: { anchor: { assoc: 0 }, head: { assoc: 0 } } }, 999));
    // A late joiner sees the Hub's state: A's identity and no cursor.
    const c = (await welcomed(ownerHeaders())).peer;
    expect((await c.join(1, room)).type).toBe('subscribed');
    expect(await waitUntil(() => c.channels.get(1)!.awareness.getStates().has(aa.clientID))).toBe(true);
    expect(c.channels.get(1)!.awareness.getStates().get(aa.clientID)).toMatchObject({ user: { deviceId: a.id, name: 'Alice PC' }, cursor: null });

    // Awareness is memory only: nothing about it reaches the database.
    const tables = (db().prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((t) => t.name);
    expect(tables.filter((t) => /awareness|presence_state/i.test(t))).toEqual([]);

    // A leaving participant's presence is removed for the others.
    pa.destroy();
    expect(await waitUntil(() => !bb.getStates().has(aa.clientID))).toBe(true);
  });

  it('refuses an update that would exceed the record cap and keeps the subscription', async () => {
    const d = await device();
    const { peer } = await welcomed(bearerHeaders(d.token));
    expect((await peer.join(1, 'scratchpad:default')).type).toBe('subscribed');
    const doc = peer.channels.get(1)!.doc;
    const server = h.hub.app.collab.open('scratchpad:default', { deviceId: null });
    // The cap is enforced once a document is near it: fill it to ~100 KB, then try to add 40 KB more.
    addSnippet(doc, snippet('big', 'x'.repeat(100_000)));
    expect(await waitUntil(() => readSnippet(server.doc, 'big') !== null)).toBe(true);
    addSnippet(doc, snippet('huge', 'y'.repeat(40_000)));
    expect(await peer.next((m) => m.type === 'doc-error' && m.code === 'too-large')).toMatchObject({ channel: 1 });
    expect(peer.ws.readyState).toBe(peer.ws.OPEN);
    expect(readSnippet(server.doc, 'huge')).toBeNull();
    // The refused update is gone for good: a client must resync (its local document now has what the Hub refused). A fresh
    // subscriber's small edit still goes through.
    const second = await device();
    const other = (await welcomed(bearerHeaders(second.token))).peer;
    expect((await other.join(1, 'scratchpad:default')).type).toBe('subscribed');
    addSnippet(other.channels.get(1)!.doc, snippet('tiny'));
    expect(await waitUntil(() => readSnippet(server.doc, 'tiny') !== null)).toBe(true);
    server.release();
  });

  it('tells a subscriber when its document is evicted', async () => {
    const d = await device();
    const { peer } = await welcomed(bearerHeaders(d.token));
    expect((await peer.join(1, 'scratchpad:default')).type).toBe('subscribed');
    h.hub.app.collab.evict('scratchpad:default');
    expect(await peer.next((m) => m.type === 'doc-error' && m.code === 'unavailable')).toMatchObject({ channel: 1 });
    expect(h.hub.app.collabSockets.subscriberCount('scratchpad:default')).toBe(0);
    expect(peer.ws.readyState).toBe(peer.ws.OPEN);
  });

  it('closes with 4003 when a device or a session is revoked', async () => {
    const d = await device();
    const dp = (await welcomed(bearerHeaders(d.token))).peer;
    const second = await h.signIn();
    const sp = (await welcomed(ownerHeaders(second))).peer;
    const out = await h.call('POST', '/auth/sign-out', asOwner(second));
    expect(out.status).toBe(200);
    expect(await withClose(sp)).toBe(REALTIME_CLOSE_CODES.revoked);

    const preview = await h.call('POST', `/devices/${d.id}/revoke/preview`, asOwner());
    expect((await h.call('POST', `/devices/${d.id}/revoke`, { ...asOwner(), body: { confirmToken: preview.json.confirmToken } })).status).toBe(200);
    expect(await withClose(dp)).toBe(REALTIME_CLOSE_CODES.revoked);
  });

  it('answers a socket that outlives a transfer with 4004, and closeAll closes every socket with the given code', async () => {
    const d = await device();
    const pending = (await welcomed(bearerHeaders(d.token))).peer;
    const sweep = (await welcomed(bearerHeaders(d.token))).peer;
    h.hub.app.collabSockets.closeAll(REALTIME_CLOSE_CODES.transferred, 'hub transferred');
    expect(await withClose(sweep)).toBe(REALTIME_CLOSE_CODES.transferred);
    expect(await withClose(pending)).toBe(REALTIME_CLOSE_CODES.transferred);

    const late = (await welcomed(bearerHeaders(d.token))).peer;
    setAuthority(db(), { epoch: getAuthorityEpoch(db()), state: 'transferred' });
    late.send({ type: 'heartbeat' });
    expect(await withClose(late)).toBe(REALTIME_CLOSE_CODES.transferred);
    setAuthority(db(), { epoch: getAuthorityEpoch(db()) + 1, state: 'active' });
  });

  it('closes a connection that floods frames with 4029', async () => {
    const d = await device();
    const { peer } = await welcomed(bearerHeaders(d.token));
    for (let i = 0; i < 80; i += 1) peer.send({ type: 'heartbeat' });
    expect(await withClose(peer)).toBe(REALTIME_CLOSE_CODES.rateLimited);
  });

  it('leaves /realtime enforcing its own 16 KiB message cap under the larger shared transport limit', async () => {
    const d = await device();
    const ws = new WebSocket(`wss://127.0.0.1:${h.hub.port}${HUB_REALTIME_PATH}`, { ca: h.hub.tls.certPem, headers: bearerHeaders(d.token) });
    const code = await new Promise<number>((resolve, reject) => {
      ws.on('open', () => ws.send(JSON.stringify({ type: 'heartbeat', pad: 'x'.repeat(20_000) })));
      ws.on('close', (c) => resolve(c));
      ws.on('error', reject);
    });
    expect(code).toBe(REALTIME_CLOSE_CODES.protocolError);
  });

  it('every control frame the Hub sent validates against the contract', () => {
    expect(everySeen.length).toBeGreaterThan(20);
    const types = new Set(everySeen.map((m) => m.type));
    for (const type of ['welcome', 'subscribed', 'doc-error', 'error']) expect(types.has(type), type).toBe(true);
    const codes = new Set(everySeen.filter((m) => m.type === 'doc-error').map((m) => m.code));
    for (const code of ['consent-required', 'not-found', 'too-large', 'limit', 'unavailable', 'consent-revoked']) expect(codes.has(code), code).toBe(true);
    for (const message of everySeen) expect(Value.Check(CollabServerControl, message), JSON.stringify(message)).toBe(true);
  });
});
