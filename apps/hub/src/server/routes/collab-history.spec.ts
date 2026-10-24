import * as Y from 'yjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Value from 'typebox/value';
import { MARKDOWN_TEXT } from '@dude/collab-doc';
import { CollabHistoryResponse, CollabRestoreResponse, CollabSnapshotResponse } from '@dude/contracts/hub';
import { startAuthHub } from '../auth-test-helpers.js';
import type { AuthHub, Signed } from '../auth-test-helpers.js';
import { enrolled } from '../device-test-helpers.js';
import { waitUntil } from '../../collab/collab-test-helpers.js';
import type { CollabDocHandle } from '../../collab/doc-registry.js';
import { commitCanonical, getCanonicalRecord } from '../../db/canonical-repository.js';
import { listAudit } from '../../security/audit.js';

const ALL_FLAGS = ['settings', 'favorites', 'pipelines', 'projects', 'workspaces', 'home', 'usage', 'workspace-layout', 'scratchpad'];
const flags = (over: Record<string, boolean> = {}): Record<string, boolean> => ({ ...Object.fromEntries(ALL_FLAGS.map((k) => [k, true])), ...over });
const KEY = 'markdown-doc:m1';

describe('collaborative document history routes (PD-105)', () => {
  let h: AuthHub;
  let owner: Signed;
  let on: { id: string; token: string };
  let off: { id: string; token: string };
  let handle: CollabDocHandle;
  let local: Y.Doc;

  const db = () => h.hub.hub.db;
  const asOwner = () => ({ cookie: owner.cookie, csrf: owner.csrf });
  const envId = (): string => (db().prepare('SELECT environment_id FROM environment LIMIT 1').get() as { environment_id: string }).environment_id;
  const text = (): Y.Text => local.getText(MARKDOWN_TEXT);
  const setText = (value: string): void => void local.transact(() => { text().delete(0, text().length); text().insert(0, value); });
  const history = (auth: Parameters<AuthHub['call']>[2], doc = KEY) => h.call('GET', `/collab/history?doc=${encodeURIComponent(doc)}`, auth);
  const setWebAccess = async (category: string, enabled: boolean): Promise<void> => {
    expect((await h.call('PUT', '/web/access', { ...asOwner(), body: { category, enabled } })).status).toBe(200);
  };
  async function device(categories: Record<string, boolean>): Promise<{ id: string; token: string }> {
    const e = await enrolled(h, owner);
    const res = await h.call('PUT', '/sync/state', {
      bearer: e.token, body: { cursor: 0, pending: 0, quarantined: 0, conflicts: 0, stranded: 0, categories, lastSyncAt: '2026-03-01T00:00:00.000Z' },
    });
    expect(res.status).toBe(200);
    return { id: e.device.deviceId, token: e.token };
  }
  const snapshotCount = (): number => (db().prepare('SELECT COUNT(*) AS n FROM collab_snapshots WHERE doc_key = ?').get(KEY) as { n: number }).n;

  beforeAll(async () => {
    h = await startAuthHub({
      collab: { idleUnloadMs: 50, materializer: { quietMs: 20, maxWaitMs: 100, retryMs: 50 }, store: { flushMs: 20 }, history: { idleMs: 60, minIntervalMs: 0 } },
    });
    owner = await h.signIn();
    on = await device(flags({ 'collab-documents': true }));
    off = await device(flags({ pipelines: false }));
    const at = new Date(h.clock.t).toISOString();
    commitCanonical(db(), {
      environmentId: envId(), entityType: 'markdown-doc', entityId: 'm1', op: 'upsert', now: at, deviceId: null,
      payload: { id: 'm1', title: 'Doc', body: 'seed', createdAt: at, updatedAt: at },
    });
    // An editor relaying through the registry, like a socket subscriber of the device.
    handle = h.hub.app.collab.open(KEY, { deviceId: on.id });
    local = new Y.Doc();
    Y.applyUpdate(local, Y.encodeStateAsUpdate(handle.doc));
    local.on('update', (update: Uint8Array, origin: unknown) => { if (origin !== 'remote') handle.apply(update, { deviceId: on.id }); });
    handle.onUpdate((update, origin) => { if (origin !== handle) Y.applyUpdate(local, update, 'remote'); });
    setText('version one');
    expect(await waitUntil(() => snapshotCount() === 1)).toBe(true);
    setText('version two');
    expect(await waitUntil(() => snapshotCount() === 2)).toBe(true);
  });
  afterAll(async () => {
    handle.release();
    local.destroy();
    await h.close();
  });

  it('needs a credential and the document category; a room key and a malformed id are refused', async () => {
    expect((await history({})).status).toBe(401);
    expect((await history({ bearer: 'nonsense' })).status).toBe(401);
    // A device without collab-documents, and a cookie with Markdown web access off, are refused.
    expect((await history({ bearer: off.token })).status).toBe(403);
    await setWebAccess('collab-documents', false);
    expect((await history(asOwner())).status).toBe(403);
    // The category follows the document kind: scratchpad -> scratchpad, user-script -> pipelines.
    expect((await history({ bearer: off.token }, 'scratchpad:default')).status).toBe(200);
    expect((await history({ bearer: off.token }, 'user-script:s1')).status).toBe(403);
    expect((await history({ bearer: on.token }, 'user-script:s1')).json).toEqual({ snapshots: [] });
    // Rooms are ephemeral and have no history.
    expect((await history({ bearer: on.token }, 'room:abc')).status).toBe(400);
    expect((await history({ bearer: on.token }, 'nope')).status).toBe(400);
    expect((await h.call('GET', '/collab/history/bad.id', { bearer: on.token })).status).toBe(400);
    expect((await h.call('GET', '/collab/history/missing', { bearer: on.token })).status).toBe(404);
    expect((await h.call('POST', '/collab/history/missing/restore', { bearer: on.token })).status).toBe(404);
  });

  it('lists snapshots newest first and previews one for a device token and an owner session', async () => {
    const listed = await history({ bearer: on.token });
    expect(listed.status).toBe(200);
    expect(listed.raw.headers['cache-control']).toBe('no-store');
    expect(Value.Check(CollabHistoryResponse, listed.json)).toBe(true);
    expect(listed.json.snapshots).toHaveLength(2);
    const [newest, oldest] = listed.json.snapshots as Array<{ id: string; takenAt: string; bytes: number }>;
    const preview = await h.call('GET', `/collab/history/${oldest!.id}`, { bearer: on.token });
    expect(preview.status).toBe(200);
    expect(Value.Check(CollabSnapshotResponse, preview.json)).toBe(true);
    expect(preview.json).toMatchObject({ doc: KEY, takenAt: oldest!.takenAt, payload: { id: 'm1', title: 'Doc', body: 'version one' } });
    expect((await h.call('GET', `/collab/history/${newest!.id}`, { bearer: on.token })).json.payload.body).toBe('version two');
    expect((await h.call('GET', `/collab/history/${newest!.id}`, { bearer: off.token })).status).toBe(403);
    await setWebAccess('collab-documents', true);
    expect((await history(asOwner())).json.snapshots).toHaveLength(2);
    expect((await h.call('GET', `/collab/history/${newest!.id}`, asOwner())).status).toBe(200);
    // Previewing and listing are not audited.
    expect(listAudit(db()).some((r) => r.event === 'collab.history-restored')).toBe(false);
  });

  it('restores as a forward edit after snapshotting the current state, audits without content, and a later edit still merges', async () => {
    const oldest = (await history({ bearer: on.token })).json.snapshots[1] as { id: string };
    setText('version three');
    // Refusals first: a device without the category (audited as denied) and a cookie POST without its CSRF token.
    expect((await h.call('POST', `/collab/history/${oldest.id}/restore`, { bearer: off.token })).status).toBe(403);
    expect(listAudit(db()).find((r) => r.event === 'collab.history-restored')).toMatchObject({ outcome: 'denied', detail: { reason: 'consent-required' } });
    expect((await h.call('POST', `/collab/history/${oldest.id}/restore`, { cookie: owner.cookie })).status).toBe(403);
    expect(text().toString()).toBe('version three');

    const restored = await h.call('POST', `/collab/history/${oldest.id}/restore`, asOwner());
    expect(restored.status).toBe(200);
    expect(Value.Check(CollabRestoreResponse, restored.json)).toBe(true);
    // The live document was edited forward (the subscriber received it) and the record written at once.
    expect(text().toString()).toBe('version one');
    expect(getCanonicalRecord(db(), envId(), 'markdown-doc', 'm1')?.payload).toMatchObject({ body: 'version one' });
    // The pre-restore state is the newest snapshot.
    const after = (await history({ bearer: on.token })).json.snapshots as Array<{ id: string }>;
    expect((await h.call('GET', `/collab/history/${after[0]!.id}`, { bearer: on.token })).json.payload.body).toBe('version three');
    const audit = listAudit(db()).find((r) => r.event === 'collab.history-restored' && r.outcome === 'success');
    expect(audit).toMatchObject({ actorKind: 'owner', detail: { doc: KEY, snapshotId: oldest.id } });
    expect(JSON.stringify(audit)).not.toContain('version');

    // An edit after the restore merges with it.
    text().insert(text().length, ' and more');
    expect(handle.doc.getText(MARKDOWN_TEXT).toString()).toBe('version one and more');
    expect(await waitUntil(() => (getCanonicalRecord(db(), envId(), 'markdown-doc', 'm1')?.payload as { body: string }).body === 'version one and more')).toBe(true);

    // A device token with the category restores too, under its own attribution.
    const byDevice = await h.call('POST', `/collab/history/${after[0]!.id}/restore`, { bearer: on.token });
    expect(byDevice.status).toBe(200);
    expect(text().toString()).toBe('version three');
    expect(listAudit(db()).find((r) => r.event === 'collab.history-restored' && r.outcome === 'success')).toMatchObject({ actorKind: 'device', actorId: on.id, detail: { doc: KEY, deviceId: on.id } });
  });

  it('never stores a snapshot for a room', async () => {
    const room = (await h.call('POST', '/collab/rooms', { ...asOwner(), body: { name: 'Ephemeral' } })).json.id as string;
    expect(room).toBeTruthy();
    expect(db().prepare("SELECT COUNT(*) AS n FROM collab_snapshots WHERE doc_key LIKE 'room:%'").get()).toEqual({ n: 0 });
  });
});
