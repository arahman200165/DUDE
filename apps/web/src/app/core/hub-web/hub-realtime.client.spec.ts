import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { REALTIME_CLOSE_CODES } from '@dude/contracts/hub';
import type { AppliedChangeShape } from '@dude/sync';
import { BACKOFF_MAX_MS, BACKOFF_MIN_MS, HubRealtimeClient, POLL_MS, STATE_REPORT_MS, type HubSocketLike } from './hub-realtime.client';
import { ALL_ON, apiError, makeRig, type Rig } from './testing/fake-hub';

class FakeSocket implements HubSocketLike {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: unknown[] = [];
  closed = false;
  send(data: string): void { this.sent.push(JSON.parse(data)); }
  close(): void { this.closed = true; }
  open(): void { this.onopen?.(); }
  welcome(): void { this.onmessage?.({ data: JSON.stringify({ type: 'welcome', protocolVersion: 1, sessionKind: 'owner-cookie', deviceId: 'me', heartbeatIntervalMs: 25_000, tls: {} }) }); }
  event(event: string, data: Record<string, unknown> = {}): void { this.onmessage?.({ data: JSON.stringify({ type: 'event', event, data }) }); }
  drop(code = 1006): void { this.onclose?.({ code }); }
}

describe('HubRealtimeClient', () => {
  let rig: Rig;
  let sockets: FakeSocket[];
  let applied: AppliedChangeShape[][];
  let signIn: Mock<() => void>;
  let reload: Mock<() => void>;
  let visible: boolean;
  let client: HubRealtimeClient;

  const make = (cursor = 0, access = ALL_ON): HubRealtimeClient => {
    client = new HubRealtimeClient({
      engine: rig.engine, access, cursor,
      apply: (changes) => applied.push(changes),
      snapshot: async () => ({ records: [...rig.hub.records.values()].filter((r) => !r.deleted), cursor: rig.hub.head }),
      openSocket: () => { const s = new FakeSocket(); sockets.push(s); return s; },
      socketUrl: () => 'wss://hub.test/api/v1/realtime',
      goToSignIn: signIn, reload, isVisible: () => visible,
    });
    return client;
  };
  const connect = async (): Promise<FakeSocket> => {
    client.start();
    const socket = sockets.at(-1)!;
    socket.open();
    socket.welcome();
    await vi.advanceTimersByTimeAsync(0);
    return socket;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    rig = makeRig();
    sockets = [];
    applied = [];
    signIn = vi.fn<() => void>();
    reload = vi.fn<() => void>();
    visible = true;
  });
  afterEach(() => {
    client.stop();
    vi.useRealTimers();
  });

  it('sends hello first, goes live on welcome and pulls once to catch up', async () => {
    rig.hub.external('pipeline', 'p1', { id: 'p1' });
    make();
    const socket = await connect();
    expect(socket.sent[0]).toEqual({ type: 'hello', protocolVersion: 1, minHubProtocol: 1 });
    expect(rig.connection.state()).toBe('live');
    expect(applied).toHaveLength(1);
    expect(applied[0]![0]).toMatchObject({ entityType: 'pipeline', entityId: 'p1', deleted: false });
    expect(client.currentCursor).toBe(1);
  });

  it('pulls on changes-available above the cursor, ignores one at or below it', async () => {
    make();
    const socket = await connect();
    const spy = vi.spyOn(rig.hub, 'webChanges');
    socket.event('changes-available', { revision: 0 });
    await vi.advanceTimersByTimeAsync(0);
    expect(spy).not.toHaveBeenCalled();
    rig.hub.external('favorite', 'tool:x', { id: 'tool:x' });
    socket.event('changes-available', { revision: 1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(spy).toHaveBeenCalledWith(0, 500);
    expect(applied.at(-1)![0]).toMatchObject({ entityType: 'favorite' });
  });

  it('maps settings to namespace, key and value and skips echoes of its own pushes', async () => {
    make();
    const socket = await connect();
    rig.hub.external('setting', 'base64:mode', { namespace: 'base64', key: 'mode', value: 'url' });
    const echo = rig.hub.external('setting', 'base64:wrap', { namespace: 'base64', key: 'wrap', value: true });
    rig.book.noteRecord(echo); // this browser pushed it
    socket.event('changes-available', { revision: 2 });
    await vi.advanceTimersByTimeAsync(0);
    expect(applied).toHaveLength(1);
    expect(applied[0]).toEqual([{ entityType: 'setting', entityId: 'base64:mode', deleted: false, payload: { namespace: 'base64', key: 'mode', value: 'url' }, namespace: 'base64', key: 'mode', value: 'url' }]);
    expect(client.currentCursor).toBe(2);
  });

  it('applies deletes and drops categories that are off', async () => {
    make(0, { ...ALL_ON, favorites: false });
    const socket = await connect();
    rig.hub.external('favorite', 'tool:x', { id: 'tool:x' });
    rig.hub.external('pipeline', 'p1', null);
    socket.event('changes-available', { revision: 2 });
    await vi.advanceTimersByTimeAsync(0);
    expect(applied).toHaveLength(1);
    expect(applied[0]).toEqual([{ entityType: 'pipeline', entityId: 'p1', deleted: true, payload: null }]);
  });

  it('pages through hasMore and reports state at most every 30 s', async () => {
    rig.hub.changeLimit = 2;
    for (let i = 0; i < 5; i++) rig.hub.external('pipeline', `p${i}`, { id: `p${i}` });
    make();
    const socket = await connect();
    expect(applied.flat()).toHaveLength(5);
    expect(rig.hub.states).toHaveLength(1);
    expect(rig.hub.states[0]).toMatchObject({ cursor: 5, pending: 0 });
    rig.hub.external('pipeline', 'p9', { id: 'p9' });
    socket.event('changes-available', { revision: 6 });
    await vi.advanceTimersByTimeAsync(0);
    expect(rig.hub.states).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(STATE_REPORT_MS);
    expect(rig.hub.states).toHaveLength(2);
    expect(rig.hub.states[1]!.cursor).toBe(6);
  });

  it('re-snapshots on an expired cursor and reconciles missing records as deletes', async () => {
    rig.book.note('pipeline', 'gone', 1, { id: 'gone' });
    rig.book.note('pipeline', 'kept', 1, { id: 'kept' });
    rig.hub.external('pipeline', 'kept', { id: 'kept' });
    make();
    const socket = await connect();
    rig.hub.external('pipeline', 'new', { id: 'new' });
    applied.length = 0;
    vi.spyOn(rig.hub, 'webChanges').mockRejectedValueOnce(apiError(410, 'cursor-expired'));
    socket.event('changes-available', { revision: 99 });
    await vi.advanceTimersByTimeAsync(0);
    const changes = applied.flat();
    expect(changes.find((c) => c.entityId === 'gone')).toMatchObject({ deleted: true });
    expect(changes.find((c) => c.entityId === 'new')).toMatchObject({ deleted: false });
    expect(client.currentCursor).toBe(rig.hub.head);
  });

  it('reloads the page when web access changed, not when it did not', async () => {
    make();
    const socket = await connect();
    socket.event('web-access-changed');
    await vi.advanceTimersByTimeAsync(0);
    expect(reload).not.toHaveBeenCalled();
    rig.hub.access = { ...ALL_ON, usage: false };
    socket.event('web-access-changed');
    await vi.advanceTimersByTimeAsync(0);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('goes to sign-in without wiping when the session is revoked, recovered or answers 401', async () => {
    localStorage.setItem('dude:v1:keep-me', '1');
    make();
    let socket = await connect();
    socket.event('session-revoked');
    expect(rig.connection.state()).toBe('session-expired');
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(socket.closed).toBe(true);

    rig = makeRig();
    sockets = [];
    signIn = vi.fn<() => void>();
    make();
    socket = await connect();
    socket.event('owner-recovered');
    expect(signIn).toHaveBeenCalledTimes(1);

    rig = makeRig();
    sockets = [];
    signIn = vi.fn<() => void>();
    make();
    socket = await connect();
    rig.hub.failWith = apiError(401, 'unauthorized');
    socket.event('changes-available', { revision: 5 });
    await vi.advanceTimersByTimeAsync(0);
    expect(rig.connection.state()).toBe('session-expired');
    expect(signIn).toHaveBeenCalledTimes(1);
    // Session expiry only navigates (PD-053): the origin's data stays for the next sign-in.
    expect(localStorage.getItem('dude:v1:keep-me')).toBe('1');
    localStorage.removeItem('dude:v1:keep-me');
  });

  it('reports pulls and progress for the Sync status', async () => {
    const pulling: boolean[] = [];
    const progress: { cursor: number; head: number | null }[] = [];
    client = new HubRealtimeClient({
      engine: rig.engine, access: ALL_ON, cursor: 0, apply: () => undefined,
      snapshot: async () => ({ records: [], cursor: 0 }),
      openSocket: () => { const s = new FakeSocket(); sockets.push(s); return s; },
      socketUrl: () => 'wss://hub.test/api/v1/realtime',
      goToSignIn: signIn, reload, isVisible: () => visible,
      onPulling: (p) => pulling.push(p), onProgress: (p) => progress.push(p),
    });
    rig.hub.external('pipeline', 'p1', { name: 'P' });
    await connect();
    expect(pulling).toEqual([true, false]);
    expect(progress.at(-1)).toEqual({ cursor: 1, head: 1 });
  });

  it('treats close codes 4001 and 4003 as an expired session and 4008 as incompatible', async () => {
    make();
    let socket = await connect();
    socket.drop(REALTIME_CLOSE_CODES.revoked);
    expect(signIn).toHaveBeenCalledTimes(1);

    rig = makeRig();
    sockets = [];
    make();
    socket = await connect();
    socket.drop(REALTIME_CLOSE_CODES.unsupportedProtocol);
    expect(rig.connection.state()).toBe('incompatible');
  });

  it('reconnects with exponential backoff from 1 s to 30 s and resets after a welcome', async () => {
    make();
    const first = await connect();
    rig.hub.failWith = apiError(503);
    first.drop();
    expect(rig.connection.state()).toBe('reconnecting');
    const delays: number[] = [];
    for (let i = 0; i < 7; i++) {
      const before = sockets.length;
      const expected = Math.min(BACKOFF_MIN_MS * 2 ** i, BACKOFF_MAX_MS);
      await vi.advanceTimersByTimeAsync(expected - 1);
      expect(sockets).toHaveLength(before);
      await vi.advanceTimersByTimeAsync(1);
      expect(sockets).toHaveLength(before + 1);
      delays.push(expected);
      sockets.at(-1)!.drop();
    }
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
    expect(rig.connection.state()).toBe('unreachable');
    rig.hub.failWith = null;
    await vi.advanceTimersByTimeAsync(30_000);
    const recovered = sockets.at(-1)!;
    recovered.open();
    recovered.welcome();
    await vi.advanceTimersByTimeAsync(0);
    expect(rig.connection.state()).toBe('live');
    recovered.drop();
    const count = sockets.length;
    await vi.advanceTimersByTimeAsync(BACKOFF_MIN_MS);
    expect(sockets).toHaveLength(count + 1);
  });

  it('polls every 15 s while the socket is down and the tab is visible, and goes live on a successful poll', async () => {
    make();
    const socket = await connect();
    socket.drop();
    const spy = vi.spyOn(rig.hub, 'webChanges');
    rig.hub.external('pipeline', 'p1', { id: 'p1' });
    visible = false;
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(spy).not.toHaveBeenCalled();
    visible = true;
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(applied.at(-1)![0]).toMatchObject({ entityId: 'p1' });
    expect(rig.connection.state()).toBe('live');
  });

  it('recovers from an HTTP-only failure with the socket still up: the heartbeat probes the feed and goes live again', async () => {
    make();
    await connect();
    rig.connection.set('unreachable');
    await vi.advanceTimersByTimeAsync(25_000);
    expect(rig.connection.state()).toBe('live');
  });

  it('heartbeats at the interval the Hub announces', async () => {
    make();
    const socket = await connect();
    await vi.advanceTimersByTimeAsync(25_000);
    expect(socket.sent.filter((m) => (m as { type: string }).type === 'heartbeat')).toHaveLength(1);
  });

  it('stops for good on close code 4004 (Hub transferred): no reconnect, no polling, writes locked', async () => {
    make();
    const socket = await connect();
    const opened = sockets.length;
    const spy = vi.spyOn(rig.hub, 'webChanges');
    socket.drop(REALTIME_CLOSE_CODES.transferred);
    expect(rig.connection.state()).toBe('transferred');
    await vi.advanceTimersByTimeAsync(BACKOFF_MAX_MS * 4 + POLL_MS * 4);
    expect(sockets).toHaveLength(opened);
    expect(spy).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
    // A locked state is never left.
    rig.connection.set('live');
    expect(rig.connection.state()).toBe('transferred');
  });

  it('a pull that answers hub-transferred locks the page and stops the loops instead of reporting an outage', async () => {
    make();
    const socket = await connect();
    const opened = sockets.length;
    vi.spyOn(rig.hub, 'webChanges').mockRejectedValue(apiError(503, 'hub-transferred'));
    socket.event('changes-available', { revision: 50 });
    await vi.advanceTimersByTimeAsync(0);
    expect(rig.connection.state()).toBe('transferred');
    socket.drop(1006);
    await vi.advanceTimersByTimeAsync(BACKOFF_MAX_MS * 2 + POLL_MS * 2);
    expect(sockets).toHaveLength(opened);
  });
});
