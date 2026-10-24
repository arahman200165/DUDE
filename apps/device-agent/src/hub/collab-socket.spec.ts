import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import type { CollabRefusalReason, CollabRelayFrame, CollabRelayState } from '@dude/contracts';
import { COLLAB_MAX_CONTROL_BYTES, COLLAB_MAX_FRAME_BYTES, HUB_PROTOCOL_VERSION } from '@dude/contracts/hub';
import { CollabRelayError, createCollabRelay, evaluateCollabGate } from './collab-socket.js';
import type { CollabGateInputs, CollabHolder, CollabRefusal, CollabRelay } from './collab-socket.js';

/** A stand-in for the pinned `ws` socket: records what the relay sends and lets a test play the Hub. */
class FakeSocket extends EventEmitter {
  readyState = 0;
  readonly sent: Array<{ data: string | Buffer; binary: boolean }> = [];
  pings = 0;
  terminated = false;
  send(data: string | Buffer, options?: { binary?: boolean }): void { this.sent.push({ data, binary: options?.binary === true }); }
  ping(): void { this.pings++; }
  terminate(): void { this.terminated = true; this.readyState = 3; }
  /** Plays the Hub: the upgrade completed. */
  open(): void { this.readyState = 1; this.emit('open'); }
  hubText(message: unknown): void { this.emit('message', Buffer.from(typeof message === 'string' ? message : JSON.stringify(message)), false); }
  hubBinary(bytes: Uint8Array): void { this.emit('message', Buffer.from(bytes), true); }
  hubClose(code: number): void { this.readyState = 3; this.emit('close', code); }
  texts(): unknown[] { return this.sent.filter((m) => !m.binary).map((m) => JSON.parse(String(m.data))); }
  binaries(): Buffer[] { return this.sent.filter((m) => m.binary).map((m) => m.data as Buffer); }
}

const IDENTITY = { deviceId: 'dev-1', name: 'Laptop', colorSlot: 2 };
const WELCOME = { type: 'welcome', protocolVersion: 3, sessionKind: 'device', deviceId: 'dev-1', heartbeatIntervalMs: 1000, identity: IDENTITY };

class Holder implements CollabHolder {
  readonly frames: CollabRelayFrame[] = [];
  readonly states: CollabRelayState[] = [];
  constructor(readonly id: unknown = Symbol('desktop')) {}
  frame(frame: CollabRelayFrame): void { this.frames.push(frame); }
  state(state: CollabRelayState): void { this.states.push(state); }
}

const OPEN_INPUT: CollabGateInputs = { hubState: 'online', enrolled: true, reconcileRequired: false, firstSyncDone: true };

interface Rig { relay: CollabRelay; sockets: FakeSocket[]; opens: Array<{ refreshToken: boolean }>; setGate(refusal: CollabRefusal | null): void; failNextOpen(error: unknown): void }

function rig(timings: Partial<Parameters<typeof createCollabRelay>[0]['timings'] & object> = {}): Rig {
  const sockets: FakeSocket[] = [];
  const opens: Array<{ refreshToken: boolean }> = [];
  let gate: CollabRefusal | null = null;
  let failure: unknown = null;
  const relay = createCollabRelay({
    gate: () => gate,
    openSocket: async (options) => {
      opens.push(options);
      if (failure !== null) { const error = failure; failure = null; throw error; }
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket as unknown as WebSocket;
    },
    timings: { backoffMinMs: 100, backoffMaxMs: 400, lingerMs: 500, heartbeatIntervalMs: 10_000, ...timings },
    random: () => 0,
  });
  return { relay, sockets, opens, setGate: (refusal) => { gate = refusal; }, failNextOpen: (error) => { failure = error; } };
}

const tick = async (ms = 0): Promise<void> => { await vi.advanceTimersByTimeAsync(ms); };
const b64 = (bytes: number[]): string => Buffer.from(bytes).toString('base64');
const subscribe = (channel: number, doc = 'room:r1'): CollabRelayFrame => ({ kind: 'control', text: JSON.stringify({ type: 'subscribe', channel, doc }) });

/** Opens the relay for `holder` and plays the Hub through hello and welcome. */
async function welcomed(r: Rig, holder = new Holder()): Promise<{ holder: Holder; socket: FakeSocket }> {
  expect(r.relay.open(holder)).toEqual({ ok: true });
  await tick();
  const socket = r.sockets[r.sockets.length - 1]!;
  socket.open();
  socket.hubText(WELCOME);
  return { holder, socket };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('collaboration gate', () => {
  const table: Array<[string, Partial<CollabGateInputs>, CollabRefusalReason | null]> = [
    ['open when everything holds', {}, null],
    ['not enrolled (no row)', { enrolled: false }, 'not-enrolled'],
    ['standalone', { hubState: 'standalone' }, 'not-enrolled'],
    ['revoked', { hubState: 'revoked' }, 'revoked'],
    ['authority changed', { hubState: 'authority-changed' }, 'authority-changed'],
    ['untrusted TLS', { hubState: 'untrusted-tls' }, 'untrusted-tls'],
    ['incompatible', { hubState: 'incompatible' }, 'incompatible'],
    ['reconcile flag', { reconcileRequired: true }, 'needs-reconcile'],
    ['offline', { hubState: 'offline' }, 'hub-offline'],
    ['connecting', { hubState: 'connecting' }, 'hub-offline'],
    ['first sync pending', { firstSyncDone: false }, 'first-sync-pending'],
    ['a changed Hub is never read as offline', { hubState: 'authority-changed', firstSyncDone: false }, 'authority-changed'],
    ['a reconcile flag wins over offline', { hubState: 'offline', reconcileRequired: true }, 'needs-reconcile'],
  ];
  it.each(table)('%s', (_name, patch, reason) => {
    const verdict = evaluateCollabGate({ ...OPEN_INPUT, ...patch });
    expect(verdict === null ? null : verdict.reason).toBe(reason);
    if (verdict) expect(verdict.message.length).toBeGreaterThan(10);
  });
});

describe('open', () => {
  it('refuses without opening a socket while the gate does not hold', async () => {
    const r = rig();
    const holder = new Holder();
    for (const reason of ['not-enrolled', 'revoked', 'authority-changed', 'untrusted-tls', 'incompatible', 'needs-reconcile', 'hub-offline', 'first-sync-pending'] as const) {
      r.setGate({ reason, message: reason });
      expect(r.relay.open(holder)).toEqual({ ok: false, reason, message: reason });
    }
    await tick();
    expect(r.opens).toEqual([]);
    expect(r.relay.active()).toBe(false);
    expect(holder.states).toEqual([]);
  });

  it('opens when the gate holds, says hello itself and reports connecting then open', async () => {
    const r = rig();
    const { holder, socket } = await welcomed(r);
    expect(r.opens).toEqual([{ refreshToken: false }]);
    expect(socket.texts()[0]).toEqual({ type: 'hello', protocolVersion: HUB_PROTOCOL_VERSION, minHubProtocol: 3 });
    expect(holder.states).toEqual([{ state: 'connecting' }, { state: 'open' }]);
    // The welcome passes to the renderer verbatim so its link reads the identity itself.
    expect(holder.frames).toEqual([{ kind: 'control', text: JSON.stringify(WELCOME) }]);
  });

  it('heartbeats at the announced interval and drops a socket that stops answering', async () => {
    const r = rig();
    const { socket } = await welcomed(r);
    await tick(1000);
    expect(socket.texts().filter((m) => (m as { type: string }).type === 'heartbeat')).toHaveLength(1);
    expect(socket.pings).toBe(1);
    socket.emit('pong');
    await tick(1000);
    expect(socket.terminated).toBe(false);
    await tick(1000);
    expect(socket.terminated).toBe(true);
  });

  it('does not forward anything but a welcome before the Hub welcomed it', async () => {
    const r = rig();
    const holder = new Holder();
    r.relay.open(holder);
    await tick();
    const socket = r.sockets[0]!;
    socket.open();
    socket.hubText({ type: 'subscribed', channel: 1, doc: 'room:r1' });
    socket.hubBinary(new Uint8Array([1, 0, 9]));
    expect(holder.frames).toEqual([]);
  });

  it('refuses a welcome the contract does not accept', async () => {
    const r = rig();
    const holder = new Holder();
    r.relay.open(holder);
    await tick();
    const socket = r.sockets[0]!;
    socket.open();
    socket.hubText({ ...WELCOME, identity: { deviceId: 'x' } });
    socket.hubText('not json');
    expect(holder.frames).toEqual([]);
    expect(holder.states).toEqual([{ state: 'connecting' }]);
  });
});

describe('relay', () => {
  it('passes Hub binary and control frames to the holder, verbatim', async () => {
    const r = rig();
    const { holder, socket } = await welcomed(r);
    holder.frames.length = 0;
    socket.hubBinary(new Uint8Array([1, 0, 1, 2, 3]));
    socket.hubText({ type: 'subscribed', channel: 1, doc: 'room:r1' });
    socket.hubText({ type: 'doc-error', channel: 2, code: 'forbidden', message: 'no' });
    expect(holder.frames).toEqual([
      { kind: 'binary', base64: b64([1, 0, 1, 2, 3]) },
      { kind: 'control', text: JSON.stringify({ type: 'subscribed', channel: 1, doc: 'room:r1' }) },
      { kind: 'control', text: JSON.stringify({ type: 'doc-error', channel: 2, code: 'forbidden', message: 'no' }) },
    ]);
  });

  it('drops Hub frames the contract or the caps do not allow', async () => {
    const r = rig();
    const { holder, socket } = await welcomed(r);
    holder.frames.length = 0;
    socket.hubText({ type: 'subscribed', channel: 99, doc: 'room:r1' });
    socket.hubText({ type: 'unknown' });
    socket.hubText('{"type":');
    socket.hubText(JSON.stringify({ type: 'error', code: 'x'.repeat(COLLAB_MAX_CONTROL_BYTES) }));
    socket.hubBinary(new Uint8Array(0));
    socket.hubBinary(new Uint8Array(COLLAB_MAX_FRAME_BYTES + 1));
    expect(holder.frames).toEqual([]);
  });

  it('passes the renderer subscribe, unsubscribe and binary frames to the Hub', async () => {
    const r = rig();
    const { holder, socket } = await welcomed(r);
    r.relay.send(holder, subscribe(1));
    r.relay.send(holder, { kind: 'binary', base64: b64([1, 0, 0, 1, 0]) });
    r.relay.send(holder, { kind: 'control', text: JSON.stringify({ type: 'unsubscribe', channel: 1 }) });
    expect(socket.texts().slice(1)).toEqual([{ type: 'subscribe', channel: 1, doc: 'room:r1' }, { type: 'unsubscribe', channel: 1 }]);
    expect(socket.binaries()).toEqual([Buffer.from([1, 0, 0, 1, 0])]);
  });

  it('rejects renderer control frames that are not a plain subscribe or unsubscribe', async () => {
    const r = rig();
    const { holder, socket } = await welcomed(r);
    const before = socket.sent.length;
    const bad = [
      JSON.stringify({ type: 'hello', protocolVersion: 3, minHubProtocol: 3 }),
      JSON.stringify({ type: 'heartbeat' }),
      JSON.stringify({ type: 'subscribe', channel: 9, doc: 'room:r1' }),
      JSON.stringify({ type: 'subscribe', channel: 1, doc: 'secret:r1' }),
      JSON.stringify({ type: 'subscribe', channel: 1, doc: 'room:r1', extra: true }),
      JSON.stringify({ type: 'activity', activity: null }),
      'not json',
      JSON.stringify({ type: 'unsubscribe', channel: 1, padding: 'x'.repeat(COLLAB_MAX_CONTROL_BYTES) }),
    ];
    for (const text of bad) {
      expect(() => r.relay.send(holder, { kind: 'control', text })).toThrowError(CollabRelayError);
    }
    expect(socket.sent.length).toBe(before);
  });

  it('rejects renderer binary frames that are oversized, not base64 or not shaped [channel][kind][payload]', async () => {
    const r = rig();
    const { holder, socket } = await welcomed(r);
    const before = socket.sent.length;
    const tooBig = Buffer.alloc(COLLAB_MAX_FRAME_BYTES + 1, 1).toString('base64');
    for (const frame of [
      { kind: 'binary', base64: tooBig }, { kind: 'binary', base64: '!!!!' }, { kind: 'binary', base64: '' }, { kind: 'binary', base64: b64([1]) },
      { kind: 'binary', base64: b64([0, 0, 1]) }, { kind: 'binary', base64: b64([9, 0, 1]) }, { kind: 'binary', base64: b64([1, 2, 1]) },
      { kind: 'text', text: 'x' }, { kind: 'control' }, { kind: 'control', text: '' }, null, 'frame',
    ] as unknown as CollabRelayFrame[]) {
      expect(() => r.relay.send(holder, frame), JSON.stringify(frame).slice(0, 40)).toThrowError(CollabRelayError);
    }
    expect(socket.sent.length).toBe(before);
    // The largest allowed frame still goes through.
    const max = Buffer.alloc(COLLAB_MAX_FRAME_BYTES, 7);
    max[0] = 1; max[1] = 0;
    r.relay.send(holder, { kind: 'binary', base64: max.toString('base64') });
    expect(socket.binaries()[0]!.length).toBe(COLLAB_MAX_FRAME_BYTES);
  });

  it('refuses a caller that does not hold the socket and drops frames sent before the welcome', async () => {
    const r = rig();
    const holder = new Holder();
    const stranger = new Holder();
    expect(() => r.relay.send(holder, subscribe(1))).toThrowError(expect.objectContaining({ code: 'collab-not-open' }));
    r.relay.open(holder);
    await tick();
    const socket = r.sockets[0]!;
    socket.open();
    r.relay.send(holder, subscribe(1));
    expect(socket.sent).toHaveLength(1);
    socket.hubText(WELCOME);
    expect(() => r.relay.send(stranger, subscribe(1))).toThrowError(expect.objectContaining({ code: 'collab-not-open' }));
    expect(socket.sent).toHaveLength(1);
  });
});

describe('reconnect', () => {
  it('reports a drop as retrying and reconnects after the backoff with the gate checked again', async () => {
    const r = rig();
    const { holder, socket } = await welcomed(r);
    socket.hubClose(1006);
    expect(holder.states.at(-1)).toEqual({ state: 'closed', code: 1006, reason: 'dropped', willRetry: true });
    await tick(99);
    expect(r.opens).toHaveLength(1);
    await tick(1);
    expect(r.opens).toHaveLength(2);
    const second = r.sockets[1]!;
    second.open();
    second.hubText(WELCOME);
    expect(holder.states.at(-1)).toEqual({ state: 'open' });
  });

  it('ends the hold when the gate refuses at a reconnect for a reason that needs the user', async () => {
    const r = rig();
    const { holder, socket } = await welcomed(r);
    socket.hubClose(1006);
    r.setGate({ reason: 'needs-reconcile', message: 'reconcile' });
    await tick(100);
    expect(r.opens).toHaveLength(1);
    expect(holder.states.at(-1)).toEqual({ state: 'closed', reason: 'needs-reconcile', willRetry: false });
    expect(r.relay.active()).toBe(false);
    expect(() => r.relay.send(holder, subscribe(1))).toThrowError(expect.objectContaining({ code: 'collab-not-open' }));
  });

  it('waits out a transient refusal, backs off, and connects as soon as the gate clears', async () => {
    const r = rig();
    const { holder, socket } = await welcomed(r);
    socket.hubClose(1006);
    r.setGate({ reason: 'hub-offline', message: 'offline' });
    await tick(100);
    expect(holder.states.at(-1)).toEqual({ state: 'closed', reason: 'hub-offline', willRetry: true });
    await tick(200);
    expect(r.opens).toHaveLength(1);
    r.setGate(null);
    r.relay.recheck();
    await tick();
    expect(r.opens).toHaveLength(2);
  });

  it('closes a live socket when the gate stops holding and reopens when it holds again', async () => {
    const r = rig();
    const { holder, socket } = await welcomed(r);
    r.setGate({ reason: 'hub-offline', message: 'offline' });
    r.relay.recheck();
    expect(socket.terminated).toBe(true);
    expect(holder.states.at(-1)).toEqual({ state: 'closed', reason: 'hub-offline', willRetry: true });
    r.relay.recheck();
    expect(holder.states.filter((s) => s.state === 'closed')).toHaveLength(1);
    r.setGate(null);
    r.relay.recheck();
    await tick();
    expect(r.opens).toHaveLength(2);
    r.sockets[1]!.open();
    r.sockets[1]!.hubText(WELCOME);
    expect(holder.states.at(-1)).toEqual({ state: 'open' });
  });

  it('ends the hold at once for a permanent gate change', async () => {
    const r = rig();
    const { holder, socket } = await welcomed(r);
    r.setGate({ reason: 'authority-changed', message: 'changed' });
    r.relay.recheck();
    expect(socket.terminated).toBe(true);
    expect(holder.states.at(-1)).toEqual({ state: 'closed', reason: 'authority-changed', willRetry: false });
  });

  it('retries a failed open with growing backoff and reports it once', async () => {
    const r = rig();
    const holder = new Holder();
    r.failNextOpen(new Error('unreachable'));
    r.relay.open(holder);
    await tick();
    expect(holder.states).toEqual([{ state: 'connecting' }, { state: 'closed', reason: 'unreachable', willRetry: true }]);
    await tick(100);
    expect(r.opens).toHaveLength(2);
    expect(holder.states).toHaveLength(2);
  });

  it('asks for a fresh token after the Hub rejected the credential', async () => {
    const r = rig();
    const { socket } = await welcomed(r);
    socket.hubClose(4001);
    await tick(100);
    expect(r.opens).toEqual([{ refreshToken: false }, { refreshToken: true }]);
    r.sockets[1]!.open();
    r.sockets[1]!.hubText(WELCOME);
    // A welcome proves the new token: the next drop reconnects with the cached one.
    r.sockets[1]!.hubClose(1006);
    await tick(100);
    expect(r.opens[2]).toEqual({ refreshToken: false });
  });

  it('stops for good on an incompatible protocol or a transferred Hub', async () => {
    for (const [code, reason] of [[4008, 'incompatible'], [4004, 'authority-changed']] as const) {
      const r = rig();
      const { holder, socket } = await welcomed(r);
      socket.hubClose(code);
      expect(holder.states.at(-1)).toEqual({ state: 'closed', code, reason, willRetry: false });
      await tick(1000);
      expect(r.opens).toHaveLength(1);
      expect(r.relay.active()).toBe(false);
    }
  });
});

describe('holders', () => {
  it('lets go on close, unsubscribes what the renderer subscribed and closes after the linger', async () => {
    const r = rig();
    const { holder, socket } = await welcomed(r);
    r.relay.send(holder, subscribe(1));
    r.relay.send(holder, subscribe(2, 'room:r2'));
    r.relay.send(holder, { kind: 'control', text: JSON.stringify({ type: 'unsubscribe', channel: 2 }) });
    r.relay.close(holder);
    expect(socket.texts().slice(-1)).toEqual([{ type: 'unsubscribe', channel: 1 }]);
    expect(socket.terminated).toBe(false);
    holder.frames.length = 0;
    socket.hubBinary(new Uint8Array([1, 0, 1]));
    expect(holder.frames).toEqual([]);
    await tick(500);
    expect(socket.terminated).toBe(true);
    expect(r.relay.active()).toBe(false);
  });

  it('reuses the lingering socket for the next open and replays the welcome', async () => {
    const r = rig();
    const { holder, socket } = await welcomed(r);
    r.relay.send(holder, subscribe(1));
    r.relay.close(holder);
    await tick(200);
    const next = new Holder();
    expect(r.relay.open(next)).toEqual({ ok: true });
    expect(r.opens).toHaveLength(1);
    expect(next.states).toEqual([{ state: 'open' }]);
    expect(next.frames).toEqual([{ kind: 'control', text: JSON.stringify(WELCOME) }]);
    await tick(1000);
    expect(socket.terminated).toBe(false);
  });

  it('treats a second open from the same connection as a reload: stale subscriptions end and the welcome comes again', async () => {
    const r = rig();
    const { holder, socket } = await welcomed(r);
    r.relay.send(holder, subscribe(1));
    holder.states.length = 0;
    holder.frames.length = 0;
    expect(r.relay.open(holder)).toEqual({ ok: true });
    expect(socket.texts().slice(-1)).toEqual([{ type: 'unsubscribe', channel: 1 }]);
    expect(holder.states).toEqual([{ state: 'open' }]);
    expect(holder.frames).toHaveLength(1);
    expect(r.opens).toHaveLength(1);
  });

  it('lets another connection take over and tells the first it was displaced', async () => {
    const r = rig();
    const { holder: first } = await welcomed(r);
    const second = new Holder();
    expect(r.relay.open(second)).toEqual({ ok: true });
    expect(first.states.at(-1)).toEqual({ state: 'closed', reason: 'displaced', willRetry: false });
    expect(() => r.relay.send(first, subscribe(1))).toThrowError(expect.objectContaining({ code: 'collab-not-open' }));
    expect(() => r.relay.send(second, subscribe(1))).not.toThrow();
    // The displaced connection's close must not end the new hold.
    r.relay.close(first);
    expect(r.relay.active()).toBe(true);
  });

  it('closes everything on stop', async () => {
    const r = rig();
    const { socket } = await welcomed(r);
    r.relay.stop();
    expect(socket.terminated).toBe(true);
    expect(r.relay.active()).toBe(false);
  });

  it('ends a hold that is still connecting when the holder lets go', async () => {
    const r = rig();
    const holder = new Holder();
    r.relay.open(holder);
    r.relay.close(holder);
    await tick();
    expect(r.sockets[0]!.terminated).toBe(true);
    expect(r.relay.active()).toBe(false);
  });
});
