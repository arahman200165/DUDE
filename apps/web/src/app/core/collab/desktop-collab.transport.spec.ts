import { Injector } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import {
  RELAY_COLLAB_BACKOFF_MAX_MS as DESKTOP_COLLAB_BACKOFF_MAX_MS, RELAY_COLLAB_BACKOFF_MIN_MS as DESKTOP_COLLAB_BACKOFF_MIN_MS, fromBase64, isTransientRefusal, terminalReasonFor, toBase64,
} from '@dude/collab-doc';
import type { CollabAwarenessIdentity as CollabIdentity, CollabLinkControl, CollabLinkDown, CollabLinkEvents } from '@dude/collab-doc';
import { isCollabRefusalTransient } from '@dude/contracts';
import { CollabDocService } from './collab-doc.service';
import { createDesktopCollabTransport } from './desktop-collab.transport';
import { HUB_COLLAB } from './hub-collab.token';
import { FakeCollabHub } from './testing/fake-collab-hub';
import { FakeDesktopCollabBridge } from './testing/fake-desktop-collab-bridge';

const ALICE: CollabIdentity = { deviceId: 'dev-alice', name: 'Alice', colorSlot: 1 };
const BOB: CollabIdentity = { deviceId: 'dev-bob', name: 'Bob', colorSlot: 5 };
const DOC = 'room:planning';

interface Desktop {
  readonly bridge: FakeDesktopCollabBridge;
  readonly service: CollabDocService;
}

function desktop(hub: FakeCollabHub, identity: CollabIdentity): Desktop {
  const bridge = new FakeDesktopCollabBridge(hub, identity);
  const injector = Injector.create({ providers: [{ provide: HUB_COLLAB, useValue: createDesktopCollabTransport(() => bridge) }, CollabDocService] });
  return { bridge, service: injector.get(CollabDocService) };
}

const settle = async (hub?: FakeCollabHub, ms = 0): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms);
  hub?.pump();
  await vi.advanceTimersByTimeAsync(0);
  hub?.pump();
};

const text = (session: { ytext(name: string): Y.Text }): Y.Text => session.ytext('body');

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('desktop collaboration transport over the Agent relay (PD-106)', () => {
  it('lets two desktops converge through a Hub relay, including concurrent edits', async () => {
    const hub = new FakeCollabHub();
    const a = desktop(hub, ALICE);
    const b = desktop(hub, BOB);
    const sa = a.service.open(DOC);
    const sb = b.service.open(DOC);
    await settle(hub);
    expect(sa.status()).toBe('live');
    expect(sb.status()).toBe('live');
    expect(a.service.identity()).toEqual(ALICE);

    text(sa).insert(0, 'hello');
    await settle(hub);
    expect(text(sb).toString()).toBe('hello');
    expect(hub.text(DOC)).toBe('hello');

    text(sa).insert(0, 'A:');
    text(sb).insert(text(sb).length, ' B');
    await settle(hub);
    expect(text(sa).toString()).toBe('A:hello B');
    expect(text(sb).toString()).toBe('A:hello B');
  });

  it('carries a document far larger than one base64 chunk both ways', async () => {
    const hub = new FakeCollabHub();
    const a = desktop(hub, ALICE);
    const b = desktop(hub, BOB);
    const big = 'lorem ipsum é😀 '.repeat(20_000);
    hub.room(DOC).doc.getText('body').insert(0, big);
    const sa = a.service.open(DOC);
    await settle(hub);
    expect(text(sa).toString()).toBe(big);
    const sb = b.service.open(DOC);
    await settle(hub);
    text(sb).insert(0, '>>');
    await settle(hub);
    expect(text(sa).toString()).toBe(`>>${big}`);
  });

  it('is editable while down, and edits made while the Agent reconnects merge after the welcome', async () => {
    const hub = new FakeCollabHub();
    const a = desktop(hub, ALICE);
    const b = desktop(hub, BOB);
    const sa = a.service.open(DOC);
    const sb = b.service.open(DOC);
    await settle(hub);
    text(sa).insert(0, 'base');
    await settle(hub);

    a.bridge.dropSocket();
    await settle(hub);
    expect(sa.status()).toBe('reconnecting');
    expect(sa.writable()).toBe(true);
    text(sa).insert(text(sa).length, ' offline-edit');
    text(sb).insert(0, 'peer:');
    await settle(hub);
    expect(text(sb).toString()).toBe('peer:base');

    a.bridge.restoreSocket();
    await settle(hub);
    expect(sa.status()).toBe('live');
    expect(text(sa).toString()).toBe('peer:base offline-edit');
    expect(text(sb).toString()).toBe('peer:base offline-edit');
    // The Agent reconnected by itself: the renderer did not ask for a second socket.
    expect(a.bridge.opens).toBe(1);
  });

  describe('refusals', () => {
    it.each([
      ['not-enrolled', 'unavailable'],
      ['needs-reconcile', 'unavailable'],
      ['untrusted-tls', 'unavailable'],
      ['revoked', 'offline'],
      ['authority-changed', 'offline'],
      ['incompatible', 'offline'],
    ] as const)('a %s refusal stops the link for good and the document reports %s', async (reason, status) => {
      const hub = new FakeCollabHub();
      const d = desktop(hub, ALICE);
      d.bridge.refusal = { reason, message: reason };
      const session = d.service.open(DOC);
      await settle(hub, 120_000);
      expect(session.status()).toBe(status);
      // Terminal: no asking again, and the document stays editable offline only where the transport allows it.
      expect(d.bridge.opens).toBe(1);
      expect(session.writable()).toBe(status === 'offline');
    });

    it('asks again with growing backoff while the refusal clears by itself, then goes live', async () => {
      const hub = new FakeCollabHub();
      const d = desktop(hub, ALICE);
      d.bridge.refusal = { reason: 'hub-offline', message: 'offline' };
      const session = d.service.open(DOC);
      await settle(hub);
      expect(d.bridge.opens).toBe(1);
      expect(session.status()).toBe('reconnecting');
      await settle(hub, DESKTOP_COLLAB_BACKOFF_MIN_MS - 1);
      expect(d.bridge.opens).toBe(1);
      await settle(hub, 1);
      expect(d.bridge.opens).toBe(2);
      d.bridge.refusal = { reason: 'first-sync-pending', message: 'sync' };
      await settle(hub, 2 * DESKTOP_COLLAB_BACKOFF_MIN_MS);
      expect(d.bridge.opens).toBe(3);
      await settle(hub, 4 * DESKTOP_COLLAB_BACKOFF_MIN_MS);
      expect(d.bridge.opens).toBe(4);
      d.bridge.refusal = null;
      await settle(hub, 8 * DESKTOP_COLLAB_BACKOFF_MIN_MS);
      expect(d.bridge.opens).toBe(5);
      expect(session.status()).toBe('live');
    });

    it('caps the backoff', async () => {
      const hub = new FakeCollabHub();
      const d = desktop(hub, ALICE);
      d.bridge.refusal = { reason: 'hub-offline', message: 'offline' };
      d.service.open(DOC);
      await settle(hub, 20 * DESKTOP_COLLAB_BACKOFF_MAX_MS);
      const opens = d.bridge.opens;
      await settle(hub, DESKTOP_COLLAB_BACKOFF_MAX_MS);
      expect(d.bridge.opens).toBe(opens + 1);
    });

    it('treats a failed call (the Agent is not running) as retryable but a forbidden call as final', async () => {
      const hub = new FakeCollabHub();
      const d = desktop(hub, ALICE);
      d.bridge.openError = { code: 'unavailable', message: 'The device agent is not running.' };
      const session = d.service.open(DOC);
      await settle(hub);
      expect(session.status()).toBe('reconnecting');
      d.bridge.openError = null;
      await settle(hub, DESKTOP_COLLAB_BACKOFF_MIN_MS);
      expect(session.status()).toBe('live');

      const other = desktop(hub, BOB);
      other.bridge.openError = { code: 'forbidden', message: 'forbidden' };
      const refused = other.service.open('room:other');
      await settle(hub, 120_000);
      expect(refused.status()).toBe('unavailable');
      expect(other.bridge.opens).toBe(1);
    });

    it('maps every terminal reason the Agent can give', () => {
      expect(terminalReasonFor('incompatible')).toBe('incompatible');
      expect(terminalReasonFor('authority-changed')).toBe('transferred');
      expect(terminalReasonFor('revoked')).toBe('session-expired');
      for (const other of ['not-enrolled', 'needs-reconcile', 'untrusted-tls', 'displaced', 'unreachable', undefined, 'anything']) expect(terminalReasonFor(other)).toBe('unavailable');
    });

    it('keeps its transient set equal to the contract (the adapter cannot import the contracts index at runtime)', () => {
      for (const reason of ['not-enrolled', 'revoked', 'authority-changed', 'untrusted-tls', 'incompatible', 'needs-reconcile', 'hub-offline', 'first-sync-pending', 'displaced', 'unreachable']) {
        expect(isTransientRefusal(reason), reason).toBe(isCollabRefusalTransient(reason));
      }
    });
  });

  describe('relay state', () => {
    it('reports a lost Agent as a retry and asks for the socket again, then resubscribes', async () => {
      const hub = new FakeCollabHub();
      const d = desktop(hub, ALICE);
      const session = d.service.open(DOC);
      await settle(hub);
      text(session).insert(0, 'kept');
      await settle(hub);
      d.bridge.emitState({ state: 'closed', reason: 'agent-unavailable', willRetry: false });
      await settle(hub);
      expect(session.status()).toBe('reconnecting');
      expect(d.bridge.opens).toBe(1);
      hub.connections.clear();
      await settle(hub, DESKTOP_COLLAB_BACKOFF_MIN_MS);
      expect(d.bridge.opens).toBe(2);
      expect(session.status()).toBe('live');
      expect(hub.text(DOC)).toBe('kept');
    });

    it('stops for good when another connection took the socket over', async () => {
      const hub = new FakeCollabHub();
      const d = desktop(hub, ALICE);
      const session = d.service.open(DOC);
      await settle(hub);
      d.bridge.emitState({ state: 'closed', reason: 'displaced', willRetry: false });
      await settle(hub, 120_000);
      expect(session.status()).toBe('unavailable');
      expect(d.bridge.opens).toBe(1);
    });

    it('ends the link terminally when the Agent drops the hold for a permanent reason', async () => {
      const hub = new FakeCollabHub();
      const d = desktop(hub, ALICE);
      const session = d.service.open(DOC);
      await settle(hub);
      d.bridge.emitState({ state: 'closed', code: 4008, reason: 'incompatible', willRetry: false });
      await settle(hub, 120_000);
      expect(session.status()).toBe('offline');
      expect(d.bridge.opens).toBe(1);
      expect(session.writable()).toBe(true);
    });

    it('asks again when the Agent says the hold ended for a transient reason', async () => {
      const hub = new FakeCollabHub();
      const d = desktop(hub, ALICE);
      const session = d.service.open(DOC);
      await settle(hub);
      d.bridge.emitState({ state: 'closed', reason: 'hub-offline', willRetry: false });
      await settle(hub);
      expect(session.status()).toBe('reconnecting');
      await settle(hub, DESKTOP_COLLAB_BACKOFF_MIN_MS);
      expect(d.bridge.opens).toBe(2);
      expect(session.status()).toBe('live');
    });

    it('asks again when a send finds the Agent no longer holds the socket', async () => {
      const hub = new FakeCollabHub();
      const d = desktop(hub, ALICE);
      const session = d.service.open(DOC);
      await settle(hub);
      d.bridge.sendError = 'collab-not-open';
      text(session).insert(0, 'x');
      await settle(hub);
      expect(session.status()).toBe('reconnecting');
      d.bridge.sendError = null;
      await settle(hub, DESKTOP_COLLAB_BACKOFF_MIN_MS);
      expect(d.bridge.opens).toBe(2);
      expect(session.status()).toBe('live');
      expect(hub.text(DOC)).toBe('x');
    });
  });

  describe('link', () => {
    function link(bridge: () => FakeDesktopCollabBridge | undefined) {
      const welcomes: CollabIdentity[] = [];
      const downs: CollabLinkDown[] = [];
      const controls: CollabLinkControl[] = [];
      const frames: Uint8Array[] = [];
      const events: CollabLinkEvents = {
        welcome: (identity) => welcomes.push(identity), control: (m) => controls.push(m), frame: (f) => frames.push(f), down: (d) => downs.push(d),
      };
      const transport = createDesktopCollabTransport(bridge);
      return { transport, events, welcomes, downs, controls, frames };
    }

    it('is editable while down', () => {
      expect(createDesktopCollabTransport(() => undefined).editableWhenDown).toBe(true);
    });

    it('reports unavailable at once when the build has no bridge', () => {
      const l = link(() => undefined);
      const started = l.transport.start(l.events);
      expect(l.downs).toEqual([{ kind: 'terminal', reason: 'unavailable' }]);
      expect(() => { started.sendFrame(new Uint8Array([1])); started.stop(); }).not.toThrow();
    });

    it('passes the Hub welcome identity, control messages and binary frames to the service, and drops everything before the welcome', async () => {
      const hub = new FakeCollabHub();
      const bridge = new FakeDesktopCollabBridge(hub, ALICE);
      // The Agent is not there yet, so the welcome comes later.
      bridge.openError = { code: 'unavailable', message: 'wait' };
      const l = link(() => bridge);
      l.transport.start(l.events);
      await settle();
      bridge.emitFrame({ kind: 'control', text: JSON.stringify({ type: 'subscribed', channel: 1, doc: DOC }) });
      bridge.emitFrame({ kind: 'binary', base64: toBase64(new Uint8Array([1, 0, 1, 2])) });
      expect(l.controls).toEqual([]);
      expect(l.frames).toEqual([]);
      bridge.openError = null;
      await settle(hub, DESKTOP_COLLAB_BACKOFF_MIN_MS);
      expect(l.welcomes).toEqual([ALICE]);
      bridge.emitFrame({ kind: 'control', text: JSON.stringify({ type: 'subscribed', channel: 1, doc: DOC }) });
      bridge.emitFrame({ kind: 'control', text: JSON.stringify({ type: 'doc-error', channel: 2, code: 'forbidden', message: 'ignored' }) });
      bridge.emitFrame({ kind: 'control', text: JSON.stringify({ type: 'error', code: 'rate-limited' }) });
      bridge.emitFrame({ kind: 'binary', base64: toBase64(new Uint8Array([1, 0, 1, 2])) });
      expect(l.controls).toEqual([{ type: 'subscribed', channel: 1, doc: DOC }, { type: 'doc-error', channel: 2, code: 'forbidden' }, { type: 'error', code: 'rate-limited' }]);
      expect(l.frames).toEqual([new Uint8Array([1, 0, 1, 2])]);
    });

    it('ignores frames that are not usable', async () => {
      const hub = new FakeCollabHub();
      const bridge = new FakeDesktopCollabBridge(hub, ALICE);
      const l = link(() => bridge);
      l.transport.start(l.events);
      await settle();
      for (const frame of [
        { kind: 'control', text: 'not json' }, { kind: 'control', text: '[]' }, { kind: 'control', text: '"x"' }, { kind: 'control', text: JSON.stringify({ type: 'unknown' }) },
        { kind: 'control', text: JSON.stringify({ type: 'subscribed', channel: 0, doc: DOC }) }, { kind: 'binary', base64: '***' },
      ] as const) bridge.emitFrame(frame);
      expect(l.controls).toEqual([]);
      expect(l.frames).toEqual([]);
      expect(l.downs).toEqual([]);
    });

    it('treats a welcome without a usable identity as an incompatible Hub', async () => {
      const hub = new FakeCollabHub();
      const bridge = new FakeDesktopCollabBridge(hub, ALICE);
      bridge.openError = { code: 'unavailable', message: 'wait' };
      const l = link(() => bridge);
      l.transport.start(l.events);
      await settle();
      bridge.emitFrame({ kind: 'control', text: JSON.stringify({ type: 'welcome', identity: { deviceId: 'x' } }) });
      expect(l.downs.at(-1)).toEqual({ kind: 'terminal', reason: 'incompatible' });
      expect(bridge.closes).toBe(1);
    });

    it('sends control messages and frames as JSON text and base64, only after the welcome', async () => {
      const hub = new FakeCollabHub();
      const bridge = new FakeDesktopCollabBridge(hub, ALICE);
      bridge.openError = { code: 'unavailable', message: 'wait' };
      const l = link(() => bridge);
      const started = l.transport.start(l.events);
      await settle();
      started.sendControl({ type: 'subscribe', channel: 1, doc: DOC });
      started.sendFrame(new Uint8Array([1, 0, 0]));
      expect(bridge.sent).toEqual([]);
      bridge.openError = null;
      await settle(hub, DESKTOP_COLLAB_BACKOFF_MIN_MS);
      started.sendControl({ type: 'subscribe', channel: 1, doc: DOC });
      started.sendFrame(new Uint8Array([1, 0, 1, 0]));
      expect(bridge.sent).toEqual([
        { kind: 'control', text: JSON.stringify({ type: 'subscribe', channel: 1, doc: DOC }) },
        { kind: 'binary', base64: toBase64(new Uint8Array([1, 0, 1, 0])) },
      ]);
    });

    it('stop() lets go of the Agent, unsubscribes from the bridge, cancels a pending retry and never reports a down', async () => {
      const hub = new FakeCollabHub();
      const bridge = new FakeDesktopCollabBridge(hub, ALICE);
      bridge.refusal = { reason: 'hub-offline', message: 'offline' };
      const l = link(() => bridge);
      const started = l.transport.start(l.events);
      await settle();
      expect(l.downs).toEqual([{ kind: 'retry' }]);
      expect(bridge.listening).toEqual({ frames: 1, states: 1 });
      started.stop();
      started.stop();
      expect(bridge.closes).toBe(1);
      expect(bridge.listening).toEqual({ frames: 0, states: 0 });
      await settle(hub, 120_000);
      expect(bridge.opens).toBe(1);
      expect(l.downs).toEqual([{ kind: 'retry' }]);
      bridge.emitState({ state: 'closed', reason: 'revoked', willRetry: false });
      expect(l.downs).toEqual([{ kind: 'retry' }]);
    });

    it('ignores the result of an open that a stop has already outrun', async () => {
      const hub = new FakeCollabHub();
      const bridge = new FakeDesktopCollabBridge(hub, ALICE);
      bridge.refusal = { reason: 'revoked', message: 'revoked' };
      const l = link(() => bridge);
      const started = l.transport.start(l.events);
      started.stop();
      await settle();
      expect(l.downs).toEqual([]);
    });
  });

  it('round-trips base64 for every byte value and rejects malformed text', () => {
    const all = new Uint8Array(256).map((_, i) => i);
    expect(fromBase64(toBase64(all))).toEqual(all);
    expect(fromBase64(toBase64(new Uint8Array(0)))).toEqual(new Uint8Array(0));
    expect(fromBase64('***')).toBeNull();
    const large = new Uint8Array(1024 * 1024).map((_, i) => i % 251);
    expect(fromBase64(toBase64(large))).toEqual(large);
  });
});
