import { EnvironmentInjector, createEnvironmentInjector, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { addSnippet } from '@dude/collab-doc';
import type { CollabAwarenessIdentity as CollabIdentity } from '@dude/collab-doc';
import { CollabDocService } from '../collab/collab-doc.service';
import { HUB_COLLAB, UNAVAILABLE_COLLAB_TRANSPORT } from '../collab/hub-collab.token';
import { FakeCollabHub, FakeCollabTransport } from '../collab/testing/fake-collab-hub';
import { SyncStatusService } from '../sync/sync-status.service';
import { SCRATCHPAD_DOC_KEY, SCRATCHPAD_GRACE_MS, ScratchpadCollab, remapCaret } from './scratchpad-collab';
import { ScratchpadService } from './scratchpad.service';

const ALICE: CollabIdentity = { deviceId: 'dev-alice', name: 'Alice', colorSlot: 1 };
const BOB: CollabIdentity = { deviceId: 'dev-bob', name: 'Bob', colorSlot: 5 };
const KEY = SCRATCHPAD_DOC_KEY;

interface Peer {
  readonly collab: ScratchpadCollab;
  readonly transport: FakeCollabTransport;
  readonly pending: ReturnType<typeof signal<{ pending: number } | null>>;
}

/** One drawer's worth of services over its own transport onto the shared fake Hub (a desktop edits while down, Hub web does not). */
function peer(hub: FakeCollabHub, identity: CollabIdentity, editableWhenDown = false): Peer {
  const transport = new FakeCollabTransport(hub, identity);
  transport.editableWhenDown = editableWhenDown;
  const pending = signal<{ pending: number } | null>({ pending: 0 });
  const injector = createEnvironmentInjector(
    [{ provide: HUB_COLLAB, useValue: transport }, { provide: SyncStatusService, useValue: { status: pending } }, CollabDocService, ScratchpadCollab],
    TestBed.inject(EnvironmentInjector),
  );
  return { collab: injector.get(ScratchpadCollab), transport, pending };
}

function settle(hub: FakeCollabHub): void {
  hub.pump();
  TestBed.tick();
  hub.pump();
  TestBed.tick();
}

/** Opens the drawer for `p` and completes the first connect, as an adapter would. */
function open(hub: FakeCollabHub, p: Peer): void {
  p.collab.setActive(true);
  if (p.transport.started.length === 1 && !p.transport.connection.welcomed) p.transport.welcome();
  settle(hub);
}

const seed = (hub: FakeCollabHub, id: string, title: string, body: string): void => {
  addSnippet(hub.room(KEY).doc, { id, title, body, createdAt: `2026-10-24T10:00:0${id.length}.000Z` });
  hub.pump();
};

const titles = (p: Peer): string[] => p.collab.snippets().map((snippet) => snippet.title);

describe('ScratchpadCollab (PD-099, PD-103, PD-106, PD-108)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('live mode', () => {
    it('two drawers converge on a snippet body and title, including concurrent edits', () => {
      const hub = new FakeCollabHub();
      seed(hub, 's1', 'Shopping', 'milk');
      const a = peer(hub, ALICE);
      const b = peer(hub, BOB);
      open(hub, a);
      open(hub, b);
      expect(a.collab.mode()).toBe('live');
      expect(b.collab.mode()).toBe('live');
      expect(a.collab.snippets().map((s) => [s.title, s.body])).toEqual([['Shopping', 'milk']]);

      // The editor writes the Y.Text it is bound to; the plain fallback goes through setBody.
      a.collab.bodyBinding('s1')!.ytext.insert(4, ' and eggs');
      b.collab.setBody('s1', 'oat milk');
      settle(hub);
      expect(a.collab.snippets()[0].body).toBe(b.collab.snippets()[0].body);
      expect(a.collab.snippets()[0].body).toContain('eggs');
      expect(hub.room(KEY).doc.getMap<Y.Map<unknown>>('snippets').get('s1')!.get('body')!.toString()).toBe(a.collab.snippets()[0].body);

      a.collab.setTitle('s1', 'Groceries');
      b.collab.setTitle('s1', 'Shopping list');
      settle(hub);
      expect(a.collab.snippets()[0].title).toBe(b.collab.snippets()[0].title);
      expect(a.collab.snippets()[0].title.length).toBeGreaterThan(0);
    });

    it('add, remove and reorder converge', () => {
      const hub = new FakeCollabHub();
      seed(hub, 's1', 'One', '');
      const a = peer(hub, ALICE);
      const b = peer(hub, BOB);
      open(hub, a);
      open(hub, b);

      const id = a.collab.add('Two', 'second', 'base64');
      expect(id).not.toBeNull();
      settle(hub);
      expect(titles(a)).toEqual(['Two', 'One']);
      expect(titles(b)).toEqual(['Two', 'One']);
      expect(b.collab.snippets()[0]).toMatchObject({ id, body: 'second', sourceToolId: 'base64' });

      b.collab.move(id!, 1);
      settle(hub);
      expect(titles(a)).toEqual(['One', 'Two']);
      expect(titles(b)).toEqual(['One', 'Two']);

      a.collab.remove('s1');
      settle(hub);
      expect(titles(a)).toEqual(['Two']);
      expect(titles(b)).toEqual(['Two']);
      expect(a.collab.remove('missing')).toBe(false);
    });

    it('never writes the key/value scratchpad while live', () => {
      const hub = new FakeCollabHub();
      const a = peer(hub, ALICE);
      open(hub, a);
      const store = TestBed.inject(ScratchpadService);
      a.collab.add('Live note', 'text');
      settle(hub);
      expect(store.snippets()).toEqual([]);
      expect(a.collab.snippets().map((s) => s.title)).toEqual(['Live note']);
    });

    it('maps another participant\'s cursor to the snippet it is in and counts participants', () => {
      const hub = new FakeCollabHub();
      seed(hub, 's1', 'First', 'alpha beta');
      seed(hub, 's22', 'Second', 'gamma');
      const a = peer(hub, ALICE);
      const b = peer(hub, BOB);
      open(hub, a);
      open(hub, b);
      expect(a.collab.participants()).toBe(2);
      expect(a.collab.presenceIn('s1')).toEqual([]);

      const text = b.collab.bodyBinding('s22')!.ytext;
      const at = Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, 2));
      const bob = b.transport.connection.identity;
      expect(bob.name).toBe('Bob');
      const awareness = b.collab.bodyBinding('s22')!.awareness;
      awareness.setLocalStateField('cursor', { anchor: at, head: at });
      settle(hub);

      expect(a.collab.presenceIn('s1')).toEqual([]);
      expect(a.collab.presenceIn('s22')).toEqual([expect.objectContaining({ name: 'Bob', colorSlot: 5, color: 'var(--dude-cat-web)', field: 'body' })]);
      // The cursor moves into the title of the first note.
      const title = hub.room(KEY).doc.getMap<Y.Map<unknown>>('snippets').get('s1')!.get('title') as Y.Text;
      const inTitle = Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(title, 1));
      awareness.setLocalStateField('cursor', { anchor: inTitle, head: inTitle });
      settle(hub);
      expect(a.collab.presenceIn('s22')).toEqual([]);
      expect(a.collab.presenceIn('s1')).toEqual([expect.objectContaining({ name: 'Bob', field: 'title' })]);

      // Leaving the drawer removes Bob's presence from Alice's view.
      b.collab.setActive(false);
      settle(hub);
      expect(a.collab.presenceIn('s1')).toEqual([]);
      expect(a.collab.participants()).toBe(1);
    });

    it('releases the document when the drawer closes and opens a fresh one when it reopens', () => {
      const hub = new FakeCollabHub();
      seed(hub, 's1', 'One', '');
      const a = peer(hub, ALICE);
      open(hub, a);
      expect(hub.room(KEY).subs.size).toBe(1);
      a.collab.setActive(false);
      settle(hub);
      expect(hub.room(KEY).subs.size).toBe(0);
      expect(a.collab.mode()).toBe('local');
      expect(a.collab.add('x', 'y')).toBeNull();
    });
  });

  describe('fallbacks', () => {
    it('is local with no Hub collaboration (Pages, standalone) and never opens a session', () => {
      TestBed.configureTestingModule({});
      const collab = TestBed.inject(ScratchpadCollab);
      expect(TestBed.inject(HUB_COLLAB)).toBe(UNAVAILABLE_COLLAB_TRANSPORT);
      expect(collab.available).toBe(false);
      collab.setActive(true);
      TestBed.tick();
      expect(collab.mode()).toBe('local');
      expect(collab.note()).toBeNull();
      const store = TestBed.inject(ScratchpadService);
      store.addSnippet('Kept', 'here');
      expect(collab.snippets().map((s) => s.title)).toEqual(['Kept']);
    });

    it.each(['consent-required', 'consent-revoked', 'forbidden'] as const)('a %s refusal is local, identical to the key/value editing', (code) => {
      const hub = new FakeCollabHub();
      hub.refusals.set(KEY, code);
      for (const editable of [false, true]) {
        const a = peer(hub, ALICE, editable);
        const store = TestBed.inject(ScratchpadService);
        store.replaceSnippets([{ id: 'k1', title: 'Saved', body: 'on this device', createdAt: '2026-10-24T09:00:00.000Z' }]);
        open(hub, a);
        expect(a.collab.status()).toBe('refused');
        expect(a.collab.mode()).toBe('local');
        expect(a.collab.snippets().map((s) => s.title)).toEqual(['Saved']);
        expect(a.collab.note()).toBeNull();
        expect(a.collab.add('nope', '')).toBeNull();
        a.collab.setActive(false);
      }
    });

    it('Hub web is read-only while connecting and while the Hub is not reachable, and live again once it is back', () => {
      const hub = new FakeCollabHub();
      seed(hub, 's1', 'Kept', 'body');
      const web = peer(hub, ALICE, false);
      web.collab.setActive(true);
      TestBed.tick();
      expect(web.collab.mode()).toBe('read-only');
      expect(web.collab.note()).toContain('Connecting');

      web.transport.welcome();
      settle(hub);
      expect(web.collab.mode()).toBe('live');
      expect(web.collab.note()).toBeNull();

      web.transport.drop();
      TestBed.tick();
      expect(web.collab.mode()).toBe('read-only');
      expect(web.collab.note()).toContain('Reconnecting to your Hub');
      // The notes it already holds stay visible, but nothing can change them.
      expect(web.collab.snippets().map((s) => s.title)).toEqual(['Kept']);
      expect(web.collab.add('x', '')).toBeNull();
      expect(web.collab.setTitle('s1', 'changed')).toBe(false);
      expect(web.collab.setBody('s1', 'changed')).toBe(false);
      expect(web.collab.bodyBinding('s1')).toBeNull();
      // Not even after the grace a desktop would use.
      vi.useFakeTimers();
      vi.advanceTimersByTime(SCRATCHPAD_GRACE_MS * 3);
      TestBed.tick();
      expect(web.collab.mode()).toBe('read-only');

      web.transport.reconnect();
      settle(hub);
      expect(web.collab.mode()).toBe('live');
    });
  });

  describe('desktop: grace, local fallback and return to live', () => {
    function liveDesktop(hub: FakeCollabHub): Peer {
      seed(hub, 's1', 'Notes', 'one');
      const desktop = peer(hub, ALICE, true);
      open(hub, desktop);
      expect(desktop.collab.mode()).toBe('live');
      return desktop;
    }

    it('is local (today\'s editing) before the first live connection and goes live once connected', () => {
      const hub = new FakeCollabHub();
      seed(hub, 's1', 'Notes', 'one');
      const desktop = peer(hub, ALICE, true);
      desktop.collab.setActive(true);
      TestBed.tick();
      expect(desktop.collab.mode()).toBe('local');
      expect(desktop.collab.note()).toBeNull();
      desktop.transport.welcome();
      settle(hub);
      expect(desktop.collab.mode()).toBe('live');
    });

    it('keeps the live document editable for 10 s after the link drops, then keeps the content locally and goes local', () => {
      vi.useFakeTimers();
      const hub = new FakeCollabHub();
      const desktop = liveDesktop(hub);
      const store = TestBed.inject(ScratchpadService);
      expect(store.snippets()).toEqual([]);

      desktop.transport.drop();
      TestBed.tick();
      expect(desktop.collab.mode()).toBe('live');
      expect(desktop.collab.linkUp()).toBe(false);
      expect(desktop.collab.setBody('s1', 'one, edited while down')).toBe(true);

      vi.advanceTimersByTime(SCRATCHPAD_GRACE_MS - 1);
      TestBed.tick();
      expect(desktop.collab.mode()).toBe('live');
      vi.advanceTimersByTime(1);
      TestBed.tick();

      expect(desktop.collab.mode()).toBe('local');
      expect(desktop.collab.note()).toContain('Not connected to your Hub');
      // What the document held is now the key/value scratchpad (journaled by its usual write), and it is what is shown.
      expect(store.snippets().map((s) => [s.id, s.title, s.body])).toEqual([['s1', 'Notes', 'one, edited while down']]);
      expect(desktop.collab.snippets()).toEqual(store.snippets());
      expect(desktop.collab.add('x', '')).toBeNull();
    });

    it('does not fall back when the link returns within the grace period', () => {
      vi.useFakeTimers();
      const hub = new FakeCollabHub();
      const desktop = liveDesktop(hub);
      desktop.transport.drop();
      TestBed.tick();
      vi.advanceTimersByTime(SCRATCHPAD_GRACE_MS - 1000);
      desktop.transport.reconnect();
      settle(hub);
      vi.advanceTimersByTime(SCRATCHPAD_GRACE_MS * 2);
      TestBed.tick();
      expect(desktop.collab.mode()).toBe('live');
      expect(desktop.collab.linkUp()).toBe(true);
      expect(TestBed.inject(ScratchpadService).snippets()).toEqual([]);
    });

    it('returns to live on a fresh document once the link is live and nothing is pending in the outbox', () => {
      vi.useFakeTimers();
      const hub = new FakeCollabHub();
      const desktop = liveDesktop(hub);
      desktop.transport.drop();
      desktop.collab.setBody('s1', 'one, edited while down');
      vi.advanceTimersByTime(SCRATCHPAD_GRACE_MS);
      TestBed.tick();
      expect(desktop.collab.mode()).toBe('local');
      const sockets = desktop.transport.started.length;

      // The saved edit is queued; the Hub is reachable again, but the outbox has not drained.
      desktop.pending.set({ pending: 1 });
      desktop.transport.welcome();
      settle(hub);
      expect(desktop.transport.started.length).toBe(sockets);
      expect(desktop.collab.status()).toBe('live');
      expect(desktop.collab.mode()).toBe('local');

      // The outbox drains; the Hub now holds the edit (the record write merged into its document).
      desktop.pending.set({ pending: 0 });
      TestBed.tick();
      expect(desktop.transport.started.length).toBe(sockets + 1);
      desktop.transport.welcome();
      settle(hub);
      expect(desktop.collab.mode()).toBe('live');
      expect(desktop.collab.snippets().map((s) => s.id)).toEqual(['s1']);
    });

    it('waits for an open local draft before returning to live', () => {
      vi.useFakeTimers();
      const hub = new FakeCollabHub();
      const desktop = liveDesktop(hub);
      desktop.transport.drop();
      vi.advanceTimersByTime(SCRATCHPAD_GRACE_MS);
      TestBed.tick();
      expect(desktop.collab.mode()).toBe('local');

      desktop.collab.setLocalDraftOpen(true);
      desktop.transport.welcome();
      settle(hub);
      expect(desktop.collab.status()).toBe('live');
      expect(desktop.collab.mode()).toBe('local');

      desktop.collab.setLocalDraftOpen(false);
      TestBed.tick();
      desktop.transport.welcome();
      settle(hub);
      expect(desktop.collab.mode()).toBe('live');
    });

    it('goes local at once when the Hub ends the subscription (consent revoked) after being live', () => {
      const hub = new FakeCollabHub();
      const desktop = liveDesktop(hub);
      hub.refusals.set(KEY, 'consent-revoked');
      hub.end(KEY, 'consent-revoked');
      settle(hub);
      expect(desktop.collab.mode()).toBe('local');
      expect(TestBed.inject(ScratchpadService).snippets().map((s) => s.id)).toEqual(['s1']);
    });
  });

  describe('remapCaret', () => {
    it('keeps a caret before a remote edit and shifts one after it', () => {
      expect(remapCaret('Untitled note', 'XUntitled note', 0)).toBe(0);
      expect(remapCaret('Untitled note', 'XUntitled note', 5)).toBe(6);
      expect(remapCaret('Untitled note', 'Untitled', 13)).toBe(8);
      expect(remapCaret('abc', 'abc', 2)).toBe(2);
      expect(remapCaret('abc', '', 2)).toBe(0);
    });
  });
});
