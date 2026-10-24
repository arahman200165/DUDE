import { Injector } from '@angular/core';
import { describe, expect, it } from 'vitest';
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import { COLLAB_FRAME_SYNC, encodeFrame, isCollabAwarenessState } from '@dude/collab-doc';
import type { CollabAwarenessIdentity as CollabIdentity } from '@dude/collab-doc';
import { CollabDocService } from './collab-doc.service';
import { HUB_COLLAB, UNAVAILABLE_COLLAB_TRANSPORT } from './hub-collab.token';
import { FakeCollabHub, FakeCollabTransport } from './testing/fake-collab-hub';

const ALICE: CollabIdentity = { deviceId: 'dev-alice', name: 'Alice', colorSlot: 1 };
const BOB: CollabIdentity = { deviceId: 'dev-bob', name: 'Bob', colorSlot: 5 };
const DOC = 'room:planning';

interface Peer {
  readonly service: CollabDocService;
  readonly transport: FakeCollabTransport;
}

function peer(hub: FakeCollabHub, identity: CollabIdentity, editableWhenDown = false): Peer {
  const transport = new FakeCollabTransport(hub, identity);
  transport.editableWhenDown = editableWhenDown;
  const injector = Injector.create({ providers: [{ provide: HUB_COLLAB, useValue: transport }, CollabDocService] });
  return { service: injector.get(CollabDocService), transport };
}

/** Opens `docKey` and completes the connect, as an adapter would after its hello and welcome. */
function join(p: Peer, docKey = DOC) {
  const session = p.service.open(docKey);
  if (p.transport.started.length === 1 && !p.transport.connection.welcomed) p.transport.welcome();
  p.transport.hub.pump();
  return session;
}

const body = (session: { ytext(name: string): Y.Text }): Y.Text => session.ytext('body');

describe('CollabDocService (PD-100, PD-114)', () => {
  it('two services converge on a Y.Text through the Hub, including concurrent edits', () => {
    const hub = new FakeCollabHub();
    const a = peer(hub, ALICE);
    const b = peer(hub, BOB);
    const sa = join(a);
    const sb = join(b);
    expect(sa.status()).toBe('live');
    expect(sb.status()).toBe('live');

    body(sa).insert(0, 'hello');
    hub.pump();
    expect(body(sb).toString()).toBe('hello');
    expect(hub.text(DOC)).toBe('hello');

    // Concurrent edits while neither has seen the other.
    body(sa).insert(0, 'A:');
    body(sb).insert(body(sb).length, ' B');
    hub.pump();
    expect(body(sa).toString()).toBe(body(sb).toString());
    expect(body(sa).toString()).toBe('A:hello B');
  });

  it('a late joiner receives the Hub document through the step 1 / step 2 exchange', () => {
    const hub = new FakeCollabHub();
    hub.room(DOC).doc.getText('body').insert(0, 'persisted');
    const a = peer(hub, ALICE);
    const sa = join(a);
    expect(body(sa).toString()).toBe('persisted');
  });

  it('shares one subscription between callers of a key and unsubscribes on the last release', () => {
    const hub = new FakeCollabHub();
    const a = peer(hub, ALICE);
    const first = join(a);
    const second = a.service.open(DOC);
    expect(second.doc).toBe(first.doc);
    expect(a.transport.connection.controls.filter((c) => c.type === 'subscribe')).toHaveLength(1);

    first.release();
    first.release(); // idempotent
    hub.pump();
    expect(a.transport.connection.controls.some((c) => c.type === 'unsubscribe')).toBe(false);
    second.release();
    hub.pump();
    expect(a.transport.connection.controls.at(-1)).toEqual({ type: 'unsubscribe', channel: 1 });
    expect(hub.room(DOC).subs.size).toBe(0);
  });

  describe('reconnect', () => {
    it('resubscribes with the existing Y.Doc and resyncs edits made while offline in both directions', () => {
      const hub = new FakeCollabHub();
      const a = peer(hub, ALICE);
      const b = peer(hub, BOB);
      const sa = join(a);
      const sb = join(b);
      body(sa).insert(0, 'base');
      hub.pump();
      const doc = sa.doc;

      a.transport.drop();
      expect(sa.status()).toBe('reconnecting');
      expect(hub.room(DOC).subs.size).toBe(1);

      // Alice's copy changes while the link is down (the service must still resync it), Bob keeps editing live.
      body(sa).insert(4, '+offline');
      body(sb).insert(0, 'B:');
      hub.pump();
      expect(body(sa).toString()).toBe('base+offline');
      expect(hub.text(DOC)).toBe('B:base');

      a.transport.reconnect();
      expect(sa.status()).toBe('live');
      expect(sa.doc).toBe(doc);
      expect(sa.revision()).toBe(0);
      expect(body(sa).toString()).toBe('B:base+offline');
      expect(body(sb).toString()).toBe('B:base+offline');
      expect(hub.text(DOC)).toBe('B:base+offline');
    });

    it('is not writable while the link is down on Hub web, and is when the adapter edits locally', () => {
      const hub = new FakeCollabHub();
      const web = peer(hub, ALICE, false);
      const desktop = peer(hub, BOB, true);
      const sw = join(web, 'room:one');
      const sd = join(desktop, 'room:two');
      expect(sw.writable()).toBe(true);
      expect(sd.writable()).toBe(true);

      web.transport.drop();
      desktop.transport.drop();
      expect(sw.writable()).toBe(false);
      expect(sd.writable()).toBe(true);
      web.transport.reconnect();
      expect(sw.writable()).toBe(true);
    });

    it('is not writable before the first subscription and offline after a terminal close on Hub web', () => {
      const hub = new FakeCollabHub();
      const a = peer(hub, ALICE);
      const session = a.service.open(DOC);
      expect(session.status()).toBe('connecting');
      expect(session.writable()).toBe(false);
      a.transport.welcome();
      expect(session.writable()).toBe(true);
      a.transport.drop({ kind: 'terminal', reason: 'session-expired' });
      expect(session.status()).toBe('offline');
      expect(session.writable()).toBe(false);
    });

    it('drops peers presence with the link and gets it back after the next subscription', () => {
      const hub = new FakeCollabHub();
      const a = peer(hub, ALICE);
      const b = peer(hub, BOB);
      const sa = join(a);
      const sb = join(b);
      expect([...sa.awareness.getStates().keys()].sort()).toEqual([sa.doc.clientID, sb.doc.clientID].sort());
      a.transport.drop();
      expect([...sa.awareness.getStates().keys()]).toEqual([sa.doc.clientID]);
      a.transport.reconnect();
      expect(sa.awareness.getStates().has(sb.doc.clientID)).toBe(true);
      expect(sb.awareness.getStates().has(sa.doc.clientID)).toBe(true);
    });
  });

  describe('too-large', () => {
    it('replaces the diverged doc with a fresh one, resubscribes and resyncs from the Hub', () => {
      const hub = new FakeCollabHub();
      const a = peer(hub, ALICE);
      const sa = join(a);
      body(sa).insert(0, 'kept');
      hub.pump();
      const old = sa.doc;
      const oldAwareness = sa.awareness;

      hub.rejectUpdates = true;
      body(sa).insert(4, ' and way too much');
      hub.pump();
      hub.rejectUpdates = false;

      expect(sa.refusal()).toBe('too-large');
      expect(sa.revision()).toBe(1);
      expect(sa.doc).not.toBe(old);
      expect(sa.awareness).not.toBe(oldAwareness);
      expect(sa.status()).toBe('live');
      expect(body(sa).toString()).toBe('kept');
      expect(hub.text(DOC)).toBe('kept');
      const controls = a.transport.connection.controls;
      expect(controls.slice(-2)).toEqual([{ type: 'unsubscribe', channel: 1 }, { type: 'subscribe', channel: 1, doc: DOC }]);

      // The new doc is wired: edits flow again.
      body(sa).insert(4, '!');
      hub.pump();
      expect(hub.text(DOC)).toBe('kept!');
    });
  });

  describe('refusals', () => {
    it.each(['consent-required', 'consent-revoked', 'forbidden', 'not-found', 'unavailable', 'limit'] as const)('maps the Hub code %s to a refused session', (code) => {
      const hub = new FakeCollabHub();
      hub.refusals.set(DOC, code);
      const a = peer(hub, ALICE);
      const session = join(a);
      expect(session.status()).toBe('refused');
      expect(session.refusal()).toBe(code);
      expect(session.writable()).toBe(false);
    });

    it('ends a live session when the Hub revokes consent and frees its channel', () => {
      const hub = new FakeCollabHub();
      const a = peer(hub, ALICE);
      const session = join(a, 'scratchpad:default');
      expect(session.status()).toBe('live');
      hub.end('scratchpad:default', 'consent-revoked');
      hub.pump();
      expect(session.status()).toBe('refused');
      expect(session.refusal()).toBe('consent-revoked');
      // Channel 1 is free again.
      join(a, 'room:next');
      expect(a.transport.connection.controls.at(-1)).toEqual({ type: 'subscribe', channel: 1, doc: 'room:next' });
    });

    it('refuses a malformed key locally without touching the socket', () => {
      const hub = new FakeCollabHub();
      const a = peer(hub, ALICE);
      const session = a.service.open('not a key');
      expect(session.status()).toBe('refused');
      expect(session.refusal()).toBe('not-found');
      expect(a.transport.started).toHaveLength(0);
      session.release();
    });

    it('reports unavailable for every open when the environment has no Hub collaboration', () => {
      const injector = Injector.create({ providers: [{ provide: HUB_COLLAB, useValue: UNAVAILABLE_COLLAB_TRANSPORT }, CollabDocService] });
      const service = injector.get(CollabDocService);
      const session = service.open(DOC);
      expect(session.status()).toBe('unavailable');
      expect(session.writable()).toBe(false);
      expect(service.open('scratchpad:default').status()).toBe('unavailable');
    });
  });

  describe('presence', () => {
    it('sets local awareness from the welcome identity in the strict shape the Hub validates', () => {
      const hub = new FakeCollabHub();
      const a = peer(hub, ALICE);
      const session = join(a);
      expect(session.identity()).toEqual(ALICE);
      const state = session.awareness.getLocalState();
      expect(state).toEqual({ user: ALICE, cursor: null });
      expect(isCollabAwarenessState(state)).toBe(true);
    });

    it('keeps a cursor the editor set before the identity arrived', () => {
      const hub = new FakeCollabHub();
      const a = peer(hub, ALICE);
      const session = a.service.open(DOC);
      session.awareness.setLocalStateField('cursor', { anchor: { assoc: 0 }, head: { assoc: 0 } });
      a.transport.welcome();
      expect(session.awareness.getLocalState()).toEqual({ user: ALICE, cursor: { anchor: { assoc: 0 }, head: { assoc: 0 } } });
      expect(isCollabAwarenessState(session.awareness.getLocalState())).toBe(true);
    });

    it('shows each peer to the other with the Hub-stamped identity and cursor updates', () => {
      const hub = new FakeCollabHub();
      const a = peer(hub, ALICE);
      const b = peer(hub, BOB);
      const sa = join(a);
      const sb = join(b);
      sa.awareness.setLocalStateField('cursor', { anchor: { assoc: 0 }, head: { assoc: 0 } });
      hub.pump();
      const seen = sb.awareness.getStates().get(sa.doc.clientID);
      expect(seen).toEqual({ user: ALICE, cursor: { anchor: { assoc: 0 }, head: { assoc: 0 } } });
      expect(isCollabAwarenessState(seen)).toBe(true);
    });

    it('removes presence from the Hub when the last handle is released', () => {
      const hub = new FakeCollabHub();
      const a = peer(hub, ALICE);
      const b = peer(hub, BOB);
      const sa = join(a);
      const sb = join(b);
      const aliceId = sa.doc.clientID;
      expect(sb.awareness.getStates().has(aliceId)).toBe(true);
      sa.release();
      hub.pump();
      expect(sb.awareness.getStates().has(aliceId)).toBe(false);
    });
  });

  describe('channels', () => {
    it('allocates 1..8 and refuses a ninth document locally; a release frees a channel', () => {
      const hub = new FakeCollabHub();
      const a = peer(hub, ALICE);
      const sessions = Array.from({ length: 8 }, (_, i) => join(a, `room:r${i}`));
      expect(a.transport.connection.controls.filter((c) => c.type === 'subscribe').map((c) => c.channel)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(sessions.every((s) => s.status() === 'live')).toBe(true);

      const ninth = join(a, 'room:r8');
      expect(ninth.status()).toBe('refused');
      expect(ninth.refusal()).toBe('limit');
      expect(a.transport.connection.controls.filter((c) => c.type === 'subscribe')).toHaveLength(8);

      sessions[2]!.release();
      hub.pump();
      const again = join(a, 'room:r9');
      expect(again.status()).toBe('live');
      expect(a.transport.connection.controls.at(-1)).toEqual({ type: 'subscribe', channel: 3, doc: 'room:r9' });
    });

    it('ignores frames of a channel until its subscription is confirmed', () => {
      const hub = new FakeCollabHub();
      const a = peer(hub, ALICE);
      const session = a.service.open(DOC);
      const { connection } = a.transport;
      // The link is up but the Hub has not answered the subscription yet.
      connection.welcomed = true;
      hub.connections.add(connection);
      connection.events.welcome(ALICE);
      expect(session.status()).toBe('connecting');

      // A frame still in flight for channel 1 (an earlier document on that channel): the doc must not change.
      const stray = new Y.Doc();
      stray.getText('body').insert(0, 'stray');
      const update = encoding.createEncoder();
      syncProtocol.writeUpdate(update, Y.encodeStateAsUpdate(stray));
      connection.events.frame(encodeFrame(1, COLLAB_FRAME_SYNC, encoding.toUint8Array(update)));
      expect(body(session).toString()).toBe('');

      hub.pump();
      expect(session.status()).toBe('live');
    });
  });
});
