import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MARKDOWN_TEXT } from '@dude/collab-doc';
import { CollabDocumentsResponse, CollabRoom, CollabRoomsResponse, KeepCollabRoomResponse } from '@dude/contracts/hub';
import Value from 'typebox/value';
import { startAuthHub } from '../auth-test-helpers.js';
import type { AuthHub, Signed } from '../auth-test-helpers.js';
import { enrolled } from '../device-test-helpers.js';
import { connect, sleep, waitUntil } from '../../collab/collab-test-helpers.js';
import type { Peer } from '../../collab/collab-test-helpers.js';
import { getCanonicalRecord } from '../../db/canonical-repository.js';
import { listAudit } from '../../security/audit.js';

const HELLO = { type: 'hello', protocolVersion: 3, minHubProtocol: 1 };
const ALL_FLAGS = ['settings', 'favorites', 'pipelines', 'projects', 'workspaces', 'home', 'usage', 'workspace-layout', 'scratchpad'];
const flags = (over: Record<string, boolean> = {}): Record<string, boolean> => ({ ...Object.fromEntries(ALL_FLAGS.map((k) => [k, true])), ...over });
const IDLE_MS = 300;

describe('Markdown Hub rooms', () => {
  let h: AuthHub;
  let owner: Signed;
  const peers: Peer[] = [];

  beforeAll(async () => {
    h = await startAuthHub({
      collabRooms: { maxRooms: 3, maxParticipants: 2, idleCloseMs: IDLE_MS },
      collab: { idleUnloadMs: 50, materializer: { quietMs: 20, maxWaitMs: 100, retryMs: 50 }, store: { flushMs: 20 } },
    });
    owner = await h.signIn();
  });
  afterAll(async () => {
    for (const p of peers) p.destroy();
    await h.close();
  });

  const db = () => h.hub.hub.db;
  const asOwner = (s: Signed = owner) => ({ cookie: s.cookie, csrf: s.csrf });
  const ownerHeaders = (): Record<string, string> => ({ cookie: `__Host-dude_session=${owner.cookie}`, origin: `https://127.0.0.1:${h.hub.port}` });
  const bearerHeaders = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}` });
  const envId = (): string => (db().prepare('SELECT environment_id FROM environment LIMIT 1').get() as { environment_id: string }).environment_id;
  const create = (name: string, auth: Parameters<AuthHub['call']>[2] = asOwner()) => h.call('POST', '/collab/rooms', { ...auth, body: { name } });
  const list = async (): Promise<Array<{ id: string; name: string; participants: number }>> => (await h.call('GET', '/collab/rooms', asOwner())).json.rooms;
  const clearRooms = async (): Promise<void> => {
    for (const p of peers.splice(0)) p.destroy();
    expect(await waitUntil(async () => (await list()).length === 0, IDLE_MS * 6 + 1000)).toBe(true);
  };
  async function welcomed(headers: Record<string, string>): Promise<Peer> {
    const peer = await connect(h, headers);
    peers.push(peer);
    peer.send(HELLO);
    await peer.next((m) => m.type === 'welcome');
    return peer;
  }
  async function device(over: { flags?: Record<string, boolean> } = {}): Promise<{ id: string; token: string }> {
    const e = await enrolled(h, owner);
    const res = await h.call('PUT', '/sync/state', {
      bearer: e.token, body: { cursor: 0, pending: 0, quarantined: 0, conflicts: 0, stranded: 0, categories: over.flags ?? flags(), lastSyncAt: '2026-03-01T00:00:00.000Z' },
    });
    expect(res.status).toBe(200);
    return { id: e.device.deviceId, token: e.token };
  }
  const setWebAccess = async (category: string, enabled: boolean): Promise<void> => {
    expect((await h.call('PUT', '/web/access', { ...asOwner(), body: { category, enabled } })).status).toBe(200);
  };
  const textOf = (peer: Peer, channel = 1): string => peer.channels.get(channel)!.doc.getText(MARKDOWN_TEXT).toString();

  it('needs a credential, and a cookie POST needs its CSRF token', async () => {
    expect((await h.call('GET', '/collab/rooms')).status).toBe(401);
    expect((await h.call('POST', '/collab/rooms', { body: { name: 'x' } })).status).toBe(401);
    expect((await h.call('POST', '/collab/rooms', { cookie: owner.cookie, body: { name: 'x' } })).status).toBe(403);
    expect((await h.call('GET', '/collab/rooms', { bearer: 'nonsense' })).status).toBe(401);
    expect((await h.call('POST', '/collab/rooms/abc/keep', { body: { title: 'x' } })).status).toBe(401);
    expect(await list()).toEqual([]);
  });

  it('creates, lists and validates rooms for an owner cookie, an owner bearer and a device token', async () => {
    const d = await device();
    const bearer = (await h.call('POST', '/auth/owner/bearer', { bearer: d.token, body: { password: 'a very long password' } })).json.accessToken as string;
    const fromCookie = await create('Cookie room');
    expect(fromCookie.status).toBe(201);
    expect(Value.Check(CollabRoom, fromCookie.json)).toBe(true);
    expect(fromCookie.json).toMatchObject({ name: 'Cookie room', participants: 0 });
    expect(fromCookie.json.id).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect((await create('Bearer room', { bearer })).status).toBe(201);
    expect((await h.call('GET', '/collab/rooms', { bearer: d.token })).status).toBe(200);
    const listed = await h.call('GET', '/collab/rooms', { bearer: d.token });
    expect(Value.Check(CollabRoomsResponse, listed.json)).toBe(true);
    expect(listed.json.rooms.map((r: { name: string }) => r.name)).toEqual(['Cookie room', 'Bearer room']);
    expect((await h.call('POST', '/collab/rooms', { ...asOwner(), body: { name: '' } })).status).toBe(400);
    expect((await h.call('POST', '/collab/rooms', { ...asOwner(), body: { name: 'x', extra: 1 } })).status).toBe(400);
    // A device may host a room too (it gains no other owner right).
    expect((await create('Device room', { bearer: d.token })).status).toBe(201);
    expect((await h.call('GET', '/sessions', { bearer: d.token })).status).toBe(403);
    await clearRooms();
  });

  it('limits rooms to the configured count and participants per room; participants converge', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) ids.push((await create(`Room ${i}`)).json.id as string);
    const full = await create('One too many');
    expect(full.status).toBe(409);
    expect(full.json.error.code).toBe('conflict');

    const d = await device();
    const a = await welcomed(bearerHeaders(d.token));
    const b = await welcomed(ownerHeaders());
    const c = await welcomed(ownerHeaders());
    expect((await a.join(1, `room:${ids[0]}`)).type).toBe('subscribed');
    expect((await b.join(1, `room:${ids[0]}`)).type).toBe('subscribed');
    expect(await c.join(1, `room:${ids[0]}`)).toMatchObject({ type: 'doc-error', code: 'limit' });
    expect(await c.join(1, 'room:doesnotexist')).toMatchObject({ type: 'doc-error', code: 'not-found' });
    expect((await list()).find((r) => r.id === ids[0])?.participants).toBe(2);

    a.channels.get(1)!.doc.getText(MARKDOWN_TEXT).insert(0, 'hello ');
    b.channels.get(1)!.doc.getText(MARKDOWN_TEXT).insert(0, 'world');
    expect(await waitUntil(() => textOf(a) === textOf(b) && textOf(a).length === 11)).toBe(true);
    expect([...textOf(a)].sort().join('')).toBe([...'hello world'].sort().join(''));
    // A late participant is brought up to date by the Hub's sync step.
    a.send({ type: 'unsubscribe', channel: 1 });
    expect(await waitUntil(async () => (await list()).find((r) => r.id === ids[0])?.participants === 1)).toBe(true);
    expect((await c.join(1, `room:${ids[0]}`)).type).toBe('subscribed');
    expect(await waitUntil(() => textOf(c) === textOf(b))).toBe(true);
    expect(textOf(c)).toHaveLength(11);
    await clearRooms();
  });

  it('closes a room after its last participant leaves, and one nobody joined', async () => {
    const created = await create('Short lived');
    const abandoned = await create('Abandoned');
    const id = created.json.id as string;
    const a = await welcomed(ownerHeaders());
    expect((await a.join(1, `room:${id}`)).type).toBe('subscribed');
    // While somebody is in the room the idle timer is not running.
    await sleep(IDLE_MS + 200);
    expect((await list()).map((r) => r.id)).toContain(id);
    expect((await list()).map((r) => r.id)).not.toContain(abandoned.json.id);
    a.send({ type: 'unsubscribe', channel: 1 });
    await sleep(IDLE_MS / 3);
    expect((await list()).map((r) => r.id)).toContain(id);
    expect(await waitUntil(async () => !(await list()).some((r) => r.id === id), IDLE_MS * 4)).toBe(true);
    expect(await a.join(1, `room:${id}`)).toMatchObject({ type: 'doc-error', code: 'not-found' });
  });

  it('ends a participant with unavailable when the Hub shuts its rooms down', async () => {
    const created = await create('Shutdown');
    const a = await welcomed(ownerHeaders());
    expect((await a.join(1, `room:${created.json.id as string}`)).type).toBe('subscribed');
    h.hub.app.collabRooms.closeAll();
    expect(await a.next((m) => m.type === 'doc-error' && m.code === 'unavailable')).toMatchObject({ channel: 1 });
    expect(await list()).toEqual([]);
  });

  it('keeps a room as a markdown-doc record only while collab-documents is on, and audits it', async () => {
    const created = await create('Meeting notes');
    const id = created.json.id as string;
    const a = await welcomed(ownerHeaders());
    expect((await a.join(1, `room:${id}`)).type).toBe('subscribed');
    a.channels.get(1)!.doc.getText(MARKDOWN_TEXT).insert(0, '# Agenda\n\n- ship it');
    expect(await waitUntil(() => h.hub.app.collabRooms.text(id) === '# Agenda\n\n- ship it')).toBe(true);

    const keep = (auth: Parameters<AuthHub['call']>[2], roomId = id, title = 'Notes') => h.call('POST', `/collab/rooms/${roomId}/keep`, { ...auth, body: { title } });
    await setWebAccess('collab-documents', false);
    const refused = await keep(asOwner());
    expect(refused.status).toBe(403);
    expect(db().prepare("SELECT COUNT(*) AS n FROM records WHERE entity_type = 'markdown-doc'").get()).toEqual({ n: 0 });
    expect(listAudit(db()).find((r) => r.event === 'collab.document-kept')).toMatchObject({ outcome: 'denied', detail: { reason: 'consent-required' } });
    // The same refusal reaches a device that has not enabled the category, and an owner bearer bound to it.
    const off = await device();
    expect((await keep({ bearer: off.token })).status).toBe(403);

    await setWebAccess('collab-documents', true);
    expect((await keep(asOwner(), 'missingroom')).status).toBe(404);
    expect((await h.call('POST', `/collab/rooms/${id}/keep`, { ...asOwner(), body: { title: '' } })).status).toBe(400);
    const kept = await keep(asOwner(), id, 'Weekly notes');
    expect(kept.status).toBe(200);
    expect(Value.Check(KeepCollabRoomResponse, kept.json)).toBe(true);
    const entityId = kept.json.entityId as string;
    const record = getCanonicalRecord(db(), envId(), 'markdown-doc', entityId);
    expect(record?.payload).toMatchObject({ id: entityId, title: 'Weekly notes', body: '# Agenda\n\n- ship it' });
    expect(record?.deleted).toBe(false);
    const audit = listAudit(db()).find((r) => r.event === 'collab.document-kept' && r.outcome === 'success');
    expect(audit).toMatchObject({ actorKind: 'owner', detail: { entityId } });
    expect(JSON.stringify(audit)).not.toContain('Weekly notes');
    expect((await list()).map((r) => r.id)).toContain(id);

    // The kept document is now served by the document registry like any other markdown-doc.
    const reader = await welcomed(ownerHeaders());
    expect((await reader.join(1, `markdown-doc:${entityId}`)).type).toBe('subscribed');
    expect(textOf(reader)).toBe('# Agenda\n\n- ship it');

    // A device with the category enabled keeps a room under its own attribution.
    const on = await device({ flags: flags({ 'collab-documents': true }) });
    const byDevice = await keep({ bearer: on.token }, id, 'From device');
    expect(byDevice.status).toBe(200);
    expect(getCanonicalRecord(db(), envId(), 'markdown-doc', byDevice.json.entityId as string)?.updatedByDeviceId).toBe(on.id);
    expect(listAudit(db()).find((r) => r.event === 'collab.document-kept' && r.outcome === 'success')).toMatchObject({ actorKind: 'device', actorId: on.id });
    // Kept documents are ordinary records: nothing expires them, and the room closing does not remove them.
    await clearRooms();
    expect(getCanonicalRecord(db(), envId(), 'markdown-doc', entityId)?.deleted).toBe(false);
  });

  it('lists and deletes kept documents only while collab-documents is on; a delete tombstones, cascades and audits', async () => {
    await setWebAccess('collab-documents', true);
    const room = (await create('To keep')).json.id as string;
    const a = await welcomed(ownerHeaders());
    expect((await a.join(1, `room:${room}`)).type).toBe('subscribed');
    a.channels.get(1)!.doc.getText(MARKDOWN_TEXT).insert(0, 'héllo');
    expect(await waitUntil(() => h.hub.app.collabRooms.text(room) === 'héllo')).toBe(true);
    const entityId = (await h.call('POST', `/collab/rooms/${room}/keep`, { ...asOwner(), body: { title: 'Kept one' } })).json.entityId as string;

    const listed = await h.call('GET', '/collab/documents', asOwner());
    expect(listed.status).toBe(200);
    expect(Value.Check(CollabDocumentsResponse, listed.json)).toBe(true);
    expect(listed.json.documents[0]).toMatchObject({ id: entityId, title: 'Kept one', bytes: 6 });
    expect(JSON.stringify(listed.json)).not.toContain('héllo');

    // Credentials and consent: none is 401; a device without the category and a cookie with web access off are 403.
    expect((await h.call('GET', '/collab/documents')).status).toBe(401);
    expect((await h.call('DELETE', `/collab/documents/${entityId}`)).status).toBe(401);
    const off = await device();
    expect((await h.call('GET', '/collab/documents', { bearer: off.token })).status).toBe(403);
    expect((await h.call('DELETE', `/collab/documents/${entityId}`, { bearer: off.token })).status).toBe(403);
    await setWebAccess('collab-documents', false);
    expect((await h.call('GET', '/collab/documents', asOwner())).status).toBe(403);
    expect((await h.call('DELETE', `/collab/documents/${entityId}`, asOwner())).status).toBe(403);
    expect(listAudit(db()).find((r) => r.event === 'collab.document-deleted')).toMatchObject({ outcome: 'denied', detail: { reason: 'consent-required' } });
    expect(getCanonicalRecord(db(), envId(), 'markdown-doc', entityId)?.deleted).toBe(false);
    await setWebAccess('collab-documents', true);
    // A cookie DELETE needs its CSRF token.
    expect((await h.call('DELETE', `/collab/documents/${entityId}`, { cookie: owner.cookie })).status).toBe(403);
    expect((await h.call('DELETE', '/collab/documents/bad.id', asOwner())).status).toBe(400);
    expect((await h.call('DELETE', '/collab/documents/missing', asOwner())).status).toBe(404);

    // A device with the category on may list and delete (a device may keep documents, so it may also remove them).
    const on = await device({ flags: flags({ 'collab-documents': true }) });
    expect((await h.call('GET', '/collab/documents', { bearer: on.token })).json.documents.map((d: { id: string }) => d.id)).toContain(entityId);
    const reader = await welcomed(ownerHeaders());
    expect((await reader.join(1, `markdown-doc:${entityId}`)).type).toBe('subscribed');
    const deleted = await h.call('DELETE', `/collab/documents/${entityId}`, { bearer: on.token });
    expect(deleted.status).toBe(200);
    expect(deleted.json).toEqual({ ok: true });
    const record = getCanonicalRecord(db(), envId(), 'markdown-doc', entityId);
    expect(record?.deleted).toBe(true);
    expect(record?.updatedByDeviceId).toBe(on.id);
    // The tombstone ended the live document: its subscriber is told, and no collaborative state is left behind.
    expect(await reader.next((m) => m.type === 'doc-error' && m.channel === 1)).toMatchObject({ type: 'doc-error' });
    expect(db().prepare('SELECT COUNT(*) AS n FROM collab_docs WHERE doc_key = ?').get(`markdown-doc:${entityId}`)).toEqual({ n: 0 });
    const audited = listAudit(db()).find((r) => r.event === 'collab.document-deleted' && r.outcome === 'success');
    expect(audited).toMatchObject({ actorKind: 'device', actorId: on.id, detail: { entityId, deviceId: on.id } });
    expect(JSON.stringify(audited)).not.toContain('Kept one');
    expect((await h.call('GET', '/collab/documents', asOwner())).json.documents.map((d: { id: string }) => d.id)).not.toContain(entityId);
    expect((await h.call('DELETE', `/collab/documents/${entityId}`, asOwner())).status).toBe(404);
    await clearRooms();
  });
});
