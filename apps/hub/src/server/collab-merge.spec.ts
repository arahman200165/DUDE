import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { USER_SCRIPT_BODY, editSnippet, readSnippet } from '@dude/collab-doc';
import type { CollabDocHandle } from '../collab/doc-registry.js';
import type { CollabPrincipal } from '../collab/doc-registry.js';
import { getCanonicalRecord } from '../db/canonical-repository.js';
import { listAudit } from '../security/audit.js';
import { startAuthHub } from './auth-test-helpers.js';
import type { AuthHub, Signed } from './auth-test-helpers.js';
import { enrolled } from './device-test-helpers.js';

const CREATED = '2026-03-01T00:00:00.000Z';
const LATER = '2026-03-01T00:05:00.000Z';
let n = 0;

const script = (id: string, body: string, updatedAt = CREATED) => ({
  id, name: id, body, accepts: [], produces: [], timeoutMs: 3000, createdAt: CREATED, updatedAt,
});
const snippet = (id: string, title: string, body: string) => ({ id, title, body, createdAt: CREATED });
const pad = (snippets: unknown[]) => ({ schemaVersion: 1, snippets, drawerExpanded: false });
const op = (entityType: string, entityId: string, basedOnRevision: number | null, payload: unknown, over: Record<string, unknown> = {}) => ({
  opId: `merge-op-${++n}-${Math.random().toString(36).slice(2)}`, entityType, entityId, opKind: 'upsert', schemaVersion: 1, basedOnRevision, payload, ...over,
});

describe('merging non-Yjs edits into a collaborative document (PD-102)', () => {
  let h: AuthHub;
  let owner: Signed;
  let token: string;
  let deviceId: string;
  let principal: CollabPrincipal;
  beforeAll(async () => {
    h = await startAuthHub();
    owner = await h.signIn();
    const device = await enrolled(h, owner);
    token = device.token;
    deviceId = device.device.deviceId;
    principal = { deviceId };
  });
  afterAll(async () => { await h.close(); });

  const db = () => h.hub.hub.db;
  const registry = () => h.hub.app.collab;
  const environmentId = (): string => (db().prepare('SELECT environment_id FROM environment LIMIT 1').get() as { environment_id: string }).environment_id;
  const recordOf = (type: string, id: string) => getCanonicalRecord(db(), environmentId(), type, id);
  const push = (ops: unknown[], accept = true) => h.call('POST', '/sync/push', { bearer: token, body: { ops, ...(accept ? { accept: ['merged'] } : {}) } });
  const baseCount = (docKey: string, revision: number): number =>
    (db().prepare('SELECT COUNT(*) AS n FROM collab_bases WHERE doc_key = ? AND revision = ?').get(docKey, revision) as { n: number }).n;
  const feedRevisions = (): number => (db().prepare('SELECT COALESCE(MAX(revision), 0) AS r FROM change_feed').get() as { r: number }).r;

  /** A synced record plus its open collaborative document (seeded from it, with its revision recorded as a merge base). */
  async function seed(type: 'user-script' | 'scratchpad', id: string, payload: unknown): Promise<{ revision: number; handle: CollabDocHandle; docKey: string }> {
    const created = await push([op(type, id, null, payload)]);
    expect(created.json.results[0].status).toBe('applied');
    const docKey = `${type}:${id}`;
    return { revision: created.json.results[0].revision as number, handle: registry().open(docKey, principal), docKey };
  }

  /** Another client editing the live document: a peer Y.Doc whose updates are applied to it like socket frames. */
  function peerOf(handle: CollabDocHandle): Y.Doc {
    const peer = new Y.Doc();
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(handle.doc));
    peer.on('update', (update: Uint8Array) => void handle.apply(update, principal));
    return peer;
  }

  const scriptText = (handle: CollabDocHandle): string => handle.doc.getText(USER_SCRIPT_BODY).toString();

  it('merges a stale outbox edit with a live edit elsewhere: the record and the live document both hold both edits', async () => {
    const { revision: r1, handle, docKey } = await seed('user-script', 'a1', script('a1', 'line one\nline two\nline three\n'));
    const received: Uint8Array[] = [];
    handle.onUpdate((update) => void received.push(update));

    const peer = peerOf(handle);
    const text = peer.getText(USER_SCRIPT_BODY);
    const at = text.toString().indexOf('three');
    text.delete(at, 5);
    text.insert(at, 'THREE');
    expect(registry().materializer.flush(docKey)).toBe('committed');
    const r2 = recordOf('user-script', 'a1')!.revision;
    expect(r2).toBeGreaterThan(r1);
    received.length = 0;

    const stale = op('user-script', 'a1', r1, script('a1', 'LINE ONE\nline two\nline three\n', LATER));
    const res = await push([stale]);
    const result = res.json.results[0];
    expect(result).toMatchObject({ opId: stale.opId, status: 'merged' });
    expect(result.revision).toBeGreaterThan(r2);
    expect(result.current).toMatchObject({ entityType: 'user-script', entityId: 'a1', revision: result.revision, updatedByDeviceId: deviceId, deleted: false });
    const expected = 'LINE ONE\nline two\nline THREE\n';
    expect(result.current.payload.body).toBe(expected);
    expect(result.current.payload.updatedAt).toBe(LATER);
    expect(recordOf('user-script', 'a1')!.payload).toMatchObject({ body: expected, name: 'a1' });
    expect(scriptText(handle)).toBe(expected);

    // Subscribers of the live document received the merge as an ordinary Yjs update, and it is part of the persisted state.
    expect(received.length).toBeGreaterThan(0);
    const replica = new Y.Doc();
    Y.applyUpdate(replica, Y.encodeStateAsUpdate(handle.doc));
    expect(replica.getText(USER_SCRIPT_BODY).toString()).toBe(expected);
    expect(registry().store.tailLength(docKey)).toBeGreaterThan(0);

    // The new revision is a merge base straight away, the op id is recorded, and the debounced materialization finds nothing to write.
    expect(baseCount(docKey, result.revision)).toBe(1);
    expect((db().prepare('SELECT revision FROM applied_ops WHERE op_id = ?').get(stale.opId) as { revision: number }).revision).toBe(result.revision);
    const head = feedRevisions();
    expect(registry().materializer.flush(docKey)).toBe('unchanged');
    expect(feedRevisions()).toBe(head);
    expect(listAudit(db(), { limit: 1 })[0]).toMatchObject({ event: 'sync.pushed', detail: { applied: 0, conflict: 0, merged: 1 } });
    peer.destroy();
    handle.release();
  });

  it('loads a stored document that is not in memory to merge into it', async () => {
    const { revision: r1, handle, docKey } = await seed('user-script', 'a2', script('a2', 'alpha\nbeta\ngamma\n'));
    const peer = peerOf(handle);
    peer.getText(USER_SCRIPT_BODY).insert(0, '# header\n');
    registry().materializer.flush(docKey);
    peer.destroy();
    handle.release();
    registry().closeAll();
    expect(registry().loadedKeys()).toEqual([]);

    const res = await push([op('user-script', 'a2', r1, script('a2', 'alpha\nbeta\ngamma\nomega\n', LATER))]);
    expect(res.json.results[0].status).toBe('merged');
    const expected = '# header\nalpha\nbeta\ngamma\nomega\n';
    expect(recordOf('user-script', 'a2')!.payload).toMatchObject({ body: expected });
    const reopened = registry().open(docKey, principal);
    expect(scriptText(reopened)).toBe(expected);
    reopened.release();
  });

  it('never duplicates an edit that arrived both as a Yjs frame and as an outbox write', async () => {
    const base = 'abcdefghij';
    const positions = [0, 1, 5, 9, 10];
    for (const at of positions) {
      const id = `dup${at}`;
      const { revision: r1, handle, docKey } = await seed('user-script', id, script(id, base));
      const peer = peerOf(handle);
      peer.getText(USER_SCRIPT_BODY).insert(at, 'XY');
      registry().materializer.flush(docKey);
      const expected = `${base.slice(0, at)}XY${base.slice(at)}`;

      const res = await push([op('user-script', id, r1, script(id, expected, LATER))]);
      expect(res.json.results[0].status).toBe('merged');
      expect(res.json.results[0].current.payload.body).toBe(expected);
      expect(recordOf('user-script', id)!.payload).toMatchObject({ body: expected });
      expect(scriptText(handle)).toBe(expected);
      expect(scriptText(handle).split('XY')).toHaveLength(2);
      expect(registry().materializer.flush(docKey)).toBe('unchanged');
      peer.destroy();
      handle.release();
    }
  });

  describe('a live edit the debounce has not written yet', () => {
    it('is written into the record first: an accepting client gets a merge with both the live edit and the pushed write', async () => {
      const base = 'one two three';
      for (const at of [0, 4, 13]) {
        const id = `unflushed${at}`;
        const { revision: r1, handle, docKey } = await seed('user-script', id, script(id, base));
        const peer = peerOf(handle);
        peer.getText(USER_SCRIPT_BODY).insert(at, '<<>>');
        expect(registry().materializer.pending(docKey)).toBe(true);
        expect(recordOf('user-script', id)!.revision).toBe(r1);

        // The same edit again (an outbox copy of what was typed live): kept once.
        const same = `${base.slice(0, at)}<<>>${base.slice(at)}`;
        const res = await push([op('user-script', id, r1, script(id, same, LATER))]);
        expect(res.json.results[0].status).toBe('merged');
        expect(scriptText(handle)).toBe(same);
        expect((recordOf('user-script', id)!.payload as { body: string }).body).toBe(same);
        expect(registry().materializer.flush(docKey)).toBe('unchanged');
        peer.destroy();
        handle.release();
      }
    });

    it('preserves both edits for an accepting client and a conflict (with the live edit in `current`) for an old one', async () => {
      const mk = async (id: string) => {
        const s = await seed('user-script', id, script(id, 'alpha\nbeta\ngamma'));
        const peer = peerOf(s.handle);
        peer.getText(USER_SCRIPT_BODY).insert(0, 'LIVE\n');
        return { ...s, peer };
      };
      const old = await mk('live-old');
      const head = feedRevisions();
      const refused = await push([op('user-script', 'live-old', old.revision, script('live-old', 'alpha\nbeta\ngamma\ndelta', LATER))], false);
      expect(refused.json.results[0].status).toBe('conflict');
      expect(refused.json.results[0].current.payload.body).toBe('LIVE\nalpha\nbeta\ngamma');
      expect(recordOf('user-script', 'live-old')!.payload).toMatchObject({ body: 'LIVE\nalpha\nbeta\ngamma' });
      expect(scriptText(old.handle)).toBe('LIVE\nalpha\nbeta\ngamma');
      expect(feedRevisions()).toBe(head + 1); // only the catch-up materialization

      const fresh = await mk('live-new');
      const merged = await push([op('user-script', 'live-new', fresh.revision, script('live-new', 'alpha\nbeta\ngamma\ndelta', LATER))]);
      expect(merged.json.results[0].status).toBe('merged');
      expect(merged.json.results[0].current.payload.body).toBe('LIVE\nalpha\nbeta\ngamma\ndelta');
      expect(scriptText(fresh.handle)).toBe('LIVE\nalpha\nbeta\ngamma\ndelta');
      expect(registry().materializer.flush(fresh.docKey)).toBe('unchanged');
      for (const s of [old, fresh]) { s.peer.destroy(); s.handle.release(); }
    });

    it('never overwrites the document when it could not be written into the record', async () => {
      const spy = vi.spyOn(registry().materializer, 'flush');
      const mk = async (id: string) => {
        const s = await seed('user-script', id, script(id, 'alpha\nbeta\ngamma'));
        const peer = peerOf(s.handle);
        peer.getText(USER_SCRIPT_BODY).insert(0, 'LIVE\n');
        return { ...s, peer };
      };
      try {
        const old = await mk('stuck-old');
        spy.mockReturnValueOnce('no-actor');
        const refused = await push([op('user-script', 'stuck-old', old.revision, script('stuck-old', 'alpha\nbeta\ngamma\ndelta', LATER))], false);
        expect(refused.json.results[0].status).toBe('conflict');
        // Nothing was written over the document, and the live edit is still there.
        expect(recordOf('user-script', 'stuck-old')!.revision).toBe(old.revision);
        expect(scriptText(old.handle)).toBe('LIVE\nalpha\nbeta\ngamma');

        const fresh = await mk('stuck-new');
        spy.mockReturnValueOnce('no-actor');
        const merged = await push([op('user-script', 'stuck-new', fresh.revision, script('stuck-new', 'alpha\nbeta\ngamma\ndelta', LATER))]);
        expect(merged.json.results[0].status).toBe('merged');
        expect(merged.json.results[0].current.payload.body).toBe('LIVE\nalpha\nbeta\ngamma\ndelta');
        expect(scriptText(fresh.handle)).toBe('LIVE\nalpha\nbeta\ngamma\ndelta');
        expect(registry().materializer.flush(fresh.docKey)).toBe('unchanged');
        for (const s of [old, fresh]) { s.peer.destroy(); s.handle.release(); }
      } finally {
        spy.mockRestore();
      }
    });
  });

  it('applies an ordinary write based on the current revision to the live document, so a later live edit and materialization keep it', async () => {
    const { revision: r1, handle, docKey } = await seed('user-script', 'applied1', script('applied1', 'one\ntwo'));
    const written = op('user-script', 'applied1', r1, script('applied1', 'one\ntwo\nthree', LATER));
    const res = await push([written], false);
    expect(res.json.results[0].status).toBe('applied');
    const r2 = res.json.results[0].revision as number;
    expect(scriptText(handle)).toBe('one\ntwo\nthree');
    expect(baseCount(docKey, r2)).toBe(1);
    const head = feedRevisions();
    expect(registry().materializer.flush(docKey)).toBe('unchanged');
    expect(feedRevisions()).toBe(head);

    const peer = peerOf(handle);
    peer.getText(USER_SCRIPT_BODY).insert(0, 'live\n');
    expect(registry().materializer.flush(docKey)).toBe('committed');
    expect(recordOf('user-script', 'applied1')!.payload).toMatchObject({ body: 'live\none\ntwo\nthree' });

    // A device that has not caught up pushes from r2, now stale: merged, nothing lost.
    const stale = await push([op('user-script', 'applied1', r2, script('applied1', 'one\ntwo\nthree\nfour', LATER))]);
    expect(stale.json.results[0].status).toBe('merged');
    expect(scriptText(handle)).toBe('live\none\ntwo\nthree\nfour');
    peer.destroy();
    handle.release();
  });

  it('applies a write to a stored document that is not in memory', async () => {
    const stored = await seed('user-script', 'applied2', script('applied2', 'a\nb'));
    stored.handle.release();
    registry().closeAll();
    const res = await push([op('user-script', 'applied2', stored.revision, script('applied2', 'a\nb\nc', LATER))], false);
    expect(res.json.results[0].status).toBe('applied');
    const reopened = registry().open(stored.docKey, principal);
    expect(scriptText(reopened)).toBe('a\nb\nc');
    expect(registry().materializer.flush(stored.docKey)).toBe('unchanged');
    reopened.release();
  });

  it('merges edits to different scratchpad snippets', async () => {
    const { revision: r1, handle, docKey } = await seed('scratchpad', 'default', pad([snippet('s1', 'One', 'first body'), snippet('s2', 'Two', 'second body')]));
    const peer = peerOf(handle);
    expect(editSnippet(peer, 's2', { body: 'second body, edited live' })).toBe(true);
    expect(registry().materializer.flush(docKey)).toBe('committed');

    const mine = pad([snippet('s1', 'One!', 'first body, edited offline'), snippet('s2', 'Two', 'second body')]);
    const res = await push([op('scratchpad', 'default', r1, mine)]);
    expect(res.json.results[0].status).toBe('merged');
    const expected = pad([snippet('s1', 'One!', 'first body, edited offline'), snippet('s2', 'Two', 'second body, edited live')]);
    expect(res.json.results[0].current.payload).toEqual(expected);
    expect(recordOf('scratchpad', 'default')!.payload).toEqual(expected);
    expect(readSnippet(handle.doc, 's1')).toMatchObject({ title: 'One!', body: 'first body, edited offline' });
    expect(readSnippet(handle.doc, 's2')).toMatchObject({ body: 'second body, edited live' });
    expect(registry().materializer.flush(docKey)).toBe('unchanged');

    // An ordinary write to the scratchpad based on the merged revision also reaches the live document.
    const mergedRevision = res.json.results[0].revision as number;
    const added = pad([snippet('s1', 'One!', 'first body, edited offline'), snippet('s2', 'Two', 'second body, edited live'), snippet('s3', 'Three', 'added by a device')]);
    expect((await push([op('scratchpad', 'default', mergedRevision, added)], false)).json.results[0].status).toBe('applied');
    expect(readSnippet(handle.doc, 's3')).toMatchObject({ title: 'Three', body: 'added by a device' });
    expect(registry().materializer.flush(docKey)).toBe('unchanged');
    peer.destroy();
    handle.release();
  });

  it('answers a client that did not declare `accept` with a conflict, exactly as before', async () => {
    const { revision: r1, handle, docKey } = await seed('user-script', 'noaccept', script('noaccept', 'one\ntwo\n'));
    const peer = peerOf(handle);
    peer.getText(USER_SCRIPT_BODY).insert(0, 'zero\n');
    registry().materializer.flush(docKey);
    const r2 = recordOf('user-script', 'noaccept')!.revision;
    const head = feedRevisions();

    const stale = op('user-script', 'noaccept', r1, script('noaccept', 'one\ntwo\nthree\n', LATER));
    const res = await push([stale], false);
    expect(res.json.results[0]).toMatchObject({ opId: stale.opId, status: 'conflict', current: { revision: r2, payload: { body: 'zero\none\ntwo\n' } } });
    expect(recordOf('user-script', 'noaccept')!.revision).toBe(r2);
    expect(scriptText(handle)).toBe('zero\none\ntwo\n');
    expect(feedRevisions()).toBe(head);
    expect(db().prepare('SELECT 1 FROM applied_ops WHERE op_id = ?').get(stale.opId)).toBeUndefined();
    peer.destroy();
    handle.release();
  });

  it('keeps the conflict when the base was pruned, when a non-text field changed on both sides, or when the record is gone', async () => {
    const pruned = await seed('user-script', 'pruned', script('pruned', 'a\nb\n'));
    const p1 = peerOf(pruned.handle);
    p1.getText(USER_SCRIPT_BODY).insert(0, 'x\n');
    registry().materializer.flush(pruned.docKey);
    db().prepare('DELETE FROM collab_bases WHERE doc_key = ? AND revision = ?').run(pruned.docKey, pruned.revision);
    const resPruned = await push([op('user-script', 'pruned', pruned.revision, script('pruned', 'a\nb\nc\n', LATER))]);
    expect(resPruned.json.results[0].status).toBe('conflict');
    expect(scriptText(pruned.handle)).toBe('x\na\nb\n');

    const fields = await seed('user-script', 'fields', script('fields', 'a\nb\n'));
    // Another device renames the script through an ordinary applied write, so the live record carries a different name.
    const renamed = await push([op('user-script', 'fields', fields.revision, { ...script('fields', 'a\nb\n'), name: 'theirs' })]);
    expect(renamed.json.results[0].status).toBe('applied');
    const resFields = await push([op('user-script', 'fields', fields.revision, { ...script('fields', 'a\nb\nc\n', LATER), name: 'mine' })]);
    expect(resFields.json.results[0].status).toBe('conflict');

    const gone = await seed('user-script', 'gone', script('gone', 'a\n'));
    gone.handle.release();
    const deleted = await push([op('user-script', 'gone', gone.revision, null, { opKind: 'delete' })]);
    expect(deleted.json.results[0].status).toBe('applied');
    const resGone = await push([op('user-script', 'gone', gone.revision, script('gone', 'a\nb\n', LATER))]);
    expect(resGone.json.results[0].status).toBe('conflict');
    expect(resGone.json.results[0].current.deleted).toBe(true);
    p1.destroy();
    pruned.handle.release();
    fields.handle.release();
  });

  it('merges against the record itself when the entity has a base but no live document state', async () => {
    const { revision: r1, handle, docKey } = await seed('user-script', 'nostate', script('nostate', 'a\nb\n'));
    handle.release();
    registry().closeAll();
    // An ordinary non-collaborative commit advances the record while the (kept) base row for r1 remains.
    const advanced = await push([op('user-script', 'nostate', r1, script('nostate', 'z\na\nb\n', LATER))]);
    expect(advanced.json.results[0].status).toBe('applied');
    registry().closeAll();
    db().prepare('DELETE FROM collab_docs WHERE doc_key = ?').run(docKey);

    const res = await push([op('user-script', 'nostate', r1, script('nostate', 'a\nb\nc\n', LATER))]);
    expect(res.json.results[0].status).toBe('merged');
    expect(recordOf('user-script', 'nostate')!.payload).toMatchObject({ body: 'z\na\nb\nc\n' });
    expect(registry().loadedKeys()).not.toContain(docKey);
  });

  it('answers a retried merged push with the same result and writes nothing more', async () => {
    const { revision: r1, handle, docKey } = await seed('user-script', 'retry', script('retry', 'a\nb\nc\n'));
    const peer = peerOf(handle);
    peer.getText(USER_SCRIPT_BODY).insert(0, 'live\n');
    registry().materializer.flush(docKey);

    const stale = op('user-script', 'retry', r1, script('retry', 'a\nb\nc\nd\n', LATER));
    const first = await push([stale]);
    expect(first.json.results[0].status).toBe('merged');
    const head = feedRevisions();
    const again = await push([stale]);
    expect(again.json.results[0]).toEqual(first.json.results[0]);
    expect(feedRevisions()).toBe(head);
    expect(scriptText(handle)).toBe('live\na\nb\nc\nd\n');

    // Another write lands: the retry then falls back to the ordinary duplicate answer with the recorded revision.
    peer.getText(USER_SCRIPT_BODY).insert(0, 'later\n');
    registry().materializer.flush(docKey);
    const afterMore = await push([stale]);
    expect(afterMore.json.results[0]).toEqual({ opId: stale.opId, status: 'duplicate', revision: first.json.results[0].revision });

    // A retried plain applied write stays `duplicate`.
    const plain = op('user-script', 'retry-plain', null, script('retry-plain', 'x'));
    expect((await push([plain])).json.results[0].status).toBe('applied');
    expect((await push([plain])).json.results[0]).toMatchObject({ status: 'duplicate' });
    peer.destroy();
    handle.release();
  });

  describe('the Hub web push path', () => {
    let browser: Signed;
    beforeAll(async () => {
      browser = await h.signIn();
      const attached = await h.call('POST', '/web/attach', { cookie: browser.cookie, csrf: browser.csrf, body: { installationId: 'install-merge-0001', label: 'Chrome' } });
      expect(attached.status).toBe(200);
    });
    const wpush = (ops: unknown[], accept: boolean) =>
      h.call('POST', '/web/push', { cookie: browser.cookie, csrf: browser.csrf, body: { ops, ...(accept ? { accept: ['merged'] } : {}) } });

    it('merges when the browser declares `accept`, and answers a conflict when it does not', async () => {
      const { revision: r1, handle, docKey } = await seed('user-script', 'web1', script('web1', 'one\ntwo\nthree\n'));
      const peer = peerOf(handle);
      peer.getText(USER_SCRIPT_BODY).insert(0, 'live\n');
      registry().materializer.flush(docKey);
      const r2 = recordOf('user-script', 'web1')!.revision;

      const refused = await wpush([op('user-script', 'web1', r1, script('web1', 'one\ntwo\nthree\nfour\n', LATER))], false);
      expect(refused.json.results[0]).toMatchObject({ status: 'conflict', current: { revision: r2 } });

      const mine = op('user-script', 'web1', r1, script('web1', 'one\ntwo\nthree\nfour\n', LATER));
      const res = await wpush([mine], true);
      expect(res.status).toBe(200);
      expect(res.json.results[0]).toMatchObject({ opId: mine.opId, status: 'merged', current: { entityId: 'web1', payload: { body: 'live\none\ntwo\nthree\nfour\n' } } });
      expect(recordOf('user-script', 'web1')!.payload).toMatchObject({ body: 'live\none\ntwo\nthree\nfour\n' });
      expect(scriptText(handle)).toBe('live\none\ntwo\nthree\nfour\n');
      expect(registry().materializer.flush(docKey)).toBe('unchanged');
      const merged = recordOf('user-script', 'web1')!;
      expect(merged.updatedByDeviceId).not.toBe(deviceId);
      expect(listAudit(db(), { limit: 1 })[0]).toMatchObject({ event: 'sync.pushed', detail: { merged: 1 } });
      peer.destroy();
      handle.release();
    });

    it('does not merge a category the web access has switched off', async () => {
      const off = await h.call('PUT', '/web/access', { cookie: owner.cookie, csrf: owner.csrf, body: { category: 'pipelines', enabled: false } });
      expect(off.status).toBe(200);
      const res = await wpush([op('user-script', 'web1', 1, script('web1', 'x', LATER))], true);
      expect(res.json.results[0]).toMatchObject({ status: 'rejected', reason: 'category-disabled' });
      await h.call('PUT', '/web/access', { cookie: owner.cookie, csrf: owner.csrf, body: { category: 'pipelines', enabled: true } });
    });
  });
});
