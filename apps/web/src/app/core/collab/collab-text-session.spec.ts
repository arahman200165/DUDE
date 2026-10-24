import { EnvironmentInjector, createEnvironmentInjector, runInInjectionContext, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CollabAwarenessIdentity as CollabIdentity } from '@dude/collab-doc';
import { SyncStatusService } from '../sync/sync-status.service';
import { CollabDocService } from './collab-doc.service';
import { COLLAB_TEXT_GRACE_MS, CollabTextSession } from './collab-text-session';
import type { CollabTextSessionConfig } from './collab-text-session';
import { HUB_COLLAB, UNAVAILABLE_COLLAB_TRANSPORT } from './hub-collab.token';
import type { CollabTransport } from '@dude/collab-doc';
import { FakeCollabHub, FakeCollabTransport } from './testing/fake-collab-hub';

const ALICE: CollabIdentity = { deviceId: 'dev-alice', name: 'Alice', colorSlot: 1 };
const BOB: CollabIdentity = { deviceId: 'dev-bob', name: 'Bob', colorSlot: 5 };
const KEY = 'user-script:s1';

interface Peer {
  readonly session: CollabTextSession;
  readonly transport: FakeCollabTransport;
  readonly pending: ReturnType<typeof signal<{ pending: number } | null>>;
  readonly key: ReturnType<typeof signal<string | null>>;
  readonly kept: string[];
  readonly promotable: ReturnType<typeof signal<boolean>>;
}

function make(transport: CollabTransport, extra: Partial<CollabTextSessionConfig> = {}) {
  const pending = signal<{ pending: number } | null>({ pending: 0 });
  const key = signal<string | null>(KEY);
  const kept: string[] = [];
  const promotable = signal(true);
  const injector = createEnvironmentInjector(
    [{ provide: HUB_COLLAB, useValue: transport }, { provide: SyncStatusService, useValue: { status: pending } }, CollabDocService],
    TestBed.inject(EnvironmentInjector),
  );
  const session = runInInjectionContext(injector, () => new CollabTextSession({
    docKey: () => key(),
    textName: 'body',
    keepLocally: (text) => kept.push(text),
    canPromote: () => promotable(),
    ...extra,
  }));
  return { session, pending, key, kept, promotable, injector };
}

function peer(hub: FakeCollabHub, identity: CollabIdentity, editableWhenDown = false): Peer {
  const transport = new FakeCollabTransport(hub, identity);
  transport.editableWhenDown = editableWhenDown;
  return { ...make(transport), transport };
}

function settle(hub: FakeCollabHub): void {
  for (let i = 0; i < 3; i += 1) {
    TestBed.tick();
    hub.pump();
  }
}

function start(hub: FakeCollabHub, p: Peer): void {
  TestBed.tick();
  if (!p.transport.connection.welcomed) p.transport.welcome();
  settle(hub);
}

/** Subscriptions to KEY the peer sent, over every connection it opened. */
const subscribes = (p: Peer): number =>
  p.transport.started.flatMap((c) => c.controls).filter((m) => m.type === 'subscribe' && m.doc === KEY).length;

describe('CollabTextSession (PD-099, PD-106)', () => {
  afterEach(() => vi.useRealTimers());

  it('is local and holds nothing without a Hub transport', () => {
    const { session } = make(UNAVAILABLE_COLLAB_TRANSPORT);
    TestBed.tick();
    expect(session.available).toBe(false);
    expect(session.mode()).toBe('local');
    expect(session.binding()).toBeNull();
    expect(session.setText('x')).toBe(false);
  });

  it('two editors share the text live, and the fallback path writes a minimal edit', () => {
    const hub = new FakeCollabHub();
    hub.room(KEY).doc.getText('body').insert(0, 'return input.value;');
    const a = peer(hub, ALICE);
    const b = peer(hub, BOB);
    start(hub, a);
    start(hub, b);
    expect(a.session.mode()).toBe('live');
    expect(a.session.text()).toBe('return input.value;');
    a.session.binding()!.ytext.insert(0, '// a\n');
    settle(hub);
    expect(b.session.text()).toBe('// a\nreturn input.value;');
    expect(b.session.setText('// a\nreturn input.value.trim();')).toBe(true);
    settle(hub);
    expect(a.session.text()).toBe('// a\nreturn input.value.trim();');
    expect(hub.text(KEY)).toBe('// a\nreturn input.value.trim();');
    expect(a.session.participants()).toBe(2);
  });

  it('a refusal (consent off) is plain local editing', () => {
    const hub = new FakeCollabHub();
    hub.refusals.set(KEY, 'consent-required');
    const a = peer(hub, ALICE);
    start(hub, a);
    expect(a.session.mode()).toBe('local');
    expect(a.session.refusal()).toBe('consent-required');
    expect(a.session.binding()).toBeNull();
  });

  it('a desktop asks again for a document the Hub did not have yet, once its outbox has drained', () => {
    const hub = new FakeCollabHub();
    hub.refusals.set(KEY, 'not-found');
    const a = peer(hub, ALICE, true);
    a.pending.set({ pending: 1 });
    start(hub, a);
    expect(a.session.mode()).toBe('local');
    expect(a.session.refusal()).toBe('not-found');

    // The save reaches the Hub; the outbox drains and the document is asked for again.
    hub.refusals.delete(KEY);
    hub.room(KEY).doc.getText('body').insert(0, 'saved here');
    a.pending.set({ pending: 0 });
    start(hub, a);
    expect(a.session.mode()).toBe('live');
    expect(a.session.text()).toBe('saved here');
  });

  it('a desktop asks again at most once per sync report while the Hub keeps answering not-found', () => {
    const hub = new FakeCollabHub();
    hub.refusals.set(KEY, 'not-found');
    const a = peer(hub, ALICE, true);
    start(hub, a);
    // The first answer came with the report already in hand: one more ask for it, then none until the next report.
    start(hub, a);
    start(hub, a);
    expect(subscribes(a)).toBe(2);
    expect(a.session.refusal()).toBe('not-found');
    a.pending.set({ pending: 0 });
    start(hub, a);
    start(hub, a);
    expect(subscribes(a)).toBe(3);
  });

  it('Hub web never asks again after not-found', () => {
    const hub = new FakeCollabHub();
    hub.refusals.set(KEY, 'not-found');
    const a = peer(hub, ALICE);
    start(hub, a);
    a.pending.set({ pending: 0 });
    start(hub, a);
    expect(subscribes(a)).toBe(1);
    expect(a.session.mode()).toBe('local');
  });

  it('Hub web is read-only while the Hub is unreachable and live again once it is back', () => {
    const hub = new FakeCollabHub();
    const a = peer(hub, ALICE);
    start(hub, a);
    a.transport.drop();
    settle(hub);
    expect(a.session.mode()).toBe('read-only');
    expect(a.session.note()).toContain('Reconnecting');
    a.transport.reconnect();
    settle(hub);
    expect(a.session.mode()).toBe('live');
  });

  it('a desktop keeps editing through the grace, then keeps the text locally and returns live once saved and drained', () => {
    vi.useFakeTimers();
    const hub = new FakeCollabHub();
    hub.room(KEY).doc.getText('body').insert(0, 'one');
    const a = peer(hub, ALICE, true);
    start(hub, a);
    a.transport.drop();
    settle(hub);
    expect(a.session.mode()).toBe('live');
    a.session.binding()!.ytext.insert(3, ' two');
    vi.advanceTimersByTime(COLLAB_TEXT_GRACE_MS + 1);
    settle(hub);
    expect(a.session.mode()).toBe('local');
    expect(a.kept).toEqual(['one two']);
    expect(a.session.note()).toContain('saved on this device');

    // Back online, but the local edit is unsaved: stay local.
    a.promotable.set(false);
    a.transport.reconnect();
    settle(hub);
    expect(a.session.mode()).toBe('local');
    // Saved, but still waiting in the outbox: stay local.
    a.promotable.set(true);
    a.pending.set({ pending: 1 });
    settle(hub);
    expect(a.session.mode()).toBe('local');
    // Drained: a fresh document, live again.
    a.pending.set({ pending: 0 });
    settle(hub);
    if (!a.transport.connection.welcomed) a.transport.welcome();
    settle(hub);
    expect(a.session.mode()).toBe('live');
  });

  it('switches documents when the key changes and releases on null', () => {
    const hub = new FakeCollabHub();
    hub.room('user-script:s2').doc.getText('body').insert(0, 'second');
    const a = peer(hub, ALICE);
    start(hub, a);
    a.key.set('user-script:s2');
    settle(hub);
    expect(a.session.text()).toBe('second');
    a.key.set(null);
    settle(hub);
    expect(a.session.mode()).toBe('local');
    expect(a.session.text()).toBe('');
  });
});
