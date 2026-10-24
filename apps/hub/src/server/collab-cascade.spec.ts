import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { MARKDOWN_TEXT } from '@dude/collab-doc';
import { startAuthHub } from './auth-test-helpers.js';
import type { AuthHub, Signed } from './auth-test-helpers.js';
import { enrolled } from './device-test-helpers.js';

const doc = (id: string, body: string) => ({ id, title: id, body, createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z' });

describe('collaborative documents end with their record (PD-101)', () => {
  let h: AuthHub;
  let owner: Signed;
  let token: string;
  let deviceId: string;
  beforeAll(async () => {
    h = await startAuthHub();
    owner = await h.signIn();
    const device = await enrolled(h, owner);
    token = device.token;
    deviceId = device.device.deviceId;
  });
  afterAll(async () => { await h.close(); });

  const push = (op: { entityId: string; opKind: 'upsert' | 'delete'; basedOnRevision: number | null; payload?: unknown }) =>
    h.call('POST', '/sync/push', { bearer: token, body: { ops: [{ opId: `o-${Math.random()}`, entityType: 'markdown-doc', schemaVersion: 1, ...op }] } });
  const rows = (docKey: string): number => (h.hub.hub.db.prepare(
    'SELECT (SELECT COUNT(*) FROM collab_docs WHERE doc_key = ?1) + (SELECT COUNT(*) FROM collab_bases WHERE doc_key = ?1) AS n').get(docKey) as { n: number }).n;
  const collab = () => h.hub.app.collab;

  it('exposes the registry on the app, seeded from a synced record', async () => {
    const created = await push({ entityId: 'one', opKind: 'upsert', basedOnRevision: null, payload: doc('one', 'hello') });
    expect(created.json.results[0].status).toBe('applied');
    const handle = collab().open('markdown-doc:one', { deviceId });
    expect(handle.doc.getText(MARKDOWN_TEXT).toString()).toBe('hello');
    expect(rows('markdown-doc:one')).toBe(2);
    handle.release();
  });

  it('a synced delete removes the collaborative state, unloads the document and ends its handles', async () => {
    const before = await push({ entityId: 'two', opKind: 'upsert', basedOnRevision: null, payload: doc('two', 'bye') });
    const handle = collab().open('markdown-doc:two', { deviceId });
    const closed: string[] = [];
    handle.onClosed((reason) => closed.push(reason));
    expect(rows('markdown-doc:two')).toBe(2);

    const deleted = await push({ entityId: 'two', opKind: 'delete', basedOnRevision: before.json.results[0].revision, payload: null });
    expect(deleted.json.results[0].status).toBe('applied');
    expect(rows('markdown-doc:two')).toBe(0);
    expect(closed).toEqual(['evicted']);
    expect(collab().loadedKeys()).not.toContain('markdown-doc:two');
    expect(handle.apply(Y.encodeStateAsUpdate(handle.doc), { deviceId })).toEqual({ ok: false, code: 'closed' });
  });

  it('clearing the environment deletes every collaborative document, including one that never had a record', async () => {
    const open = collab().open('scratchpad:default', { deviceId });
    const closed: string[] = [];
    open.onClosed((reason) => closed.push(reason));
    const preview = await h.call('POST', '/sync/environment/clear/preview', { cookie: owner.cookie, csrf: owner.csrf });
    expect(preview.status).toBe(200);
    const result = await h.call('POST', '/sync/environment/clear', { cookie: owner.cookie, csrf: owner.csrf, body: { confirmationId: preview.json.confirmationId } });
    expect(result.status).toBe(200);
    expect(closed).toEqual(['evicted']);
    expect(collab().loadedKeys()).toEqual([]);
    const total = h.hub.hub.db.prepare(
      'SELECT (SELECT COUNT(*) FROM collab_docs) + (SELECT COUNT(*) FROM collab_updates) + (SELECT COUNT(*) FROM collab_snapshots) + (SELECT COUNT(*) FROM collab_bases) AS n').get() as { n: number };
    expect(total.n).toBe(0);
  });
});
