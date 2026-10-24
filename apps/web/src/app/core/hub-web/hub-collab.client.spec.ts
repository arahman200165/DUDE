import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { HUB_PROTOCOL_VERSION, REALTIME_CLOSE_CODES } from '@dude/contracts/hub';
import type { CollabAwarenessIdentity as CollabIdentity, CollabLink, CollabLinkControl, CollabLinkDown, CollabLinkEvents } from '@dude/collab-doc';
import { COLLAB_MIN_HUB_PROTOCOL, createHubCollabTransport, type CollabSocketLike } from './hub-collab.client';
import { BACKOFF_MAX_MS, BACKOFF_MIN_MS } from './hub-realtime.client';

const IDENTITY: CollabIdentity = { deviceId: 'browser-1', name: 'Owner', colorSlot: 3 };

class FakeSocket implements CollabSocketLike {
  binaryType = 'blob';
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: Array<string | Uint8Array> = [];
  closed = false;
  send(data: string | Uint8Array): void { this.sent.push(data); }
  close(): void { this.closed = true; }
  open(): void { this.onopen?.(); }
  json(): Array<Record<string, unknown>> { return this.sent.filter((m): m is string => typeof m === 'string').map((m) => JSON.parse(m) as Record<string, unknown>); }
  receive(message: unknown): void { this.onmessage?.({ data: typeof message === 'string' ? message : JSON.stringify(message) }); }
  welcome(overrides: Record<string, unknown> = {}): void {
    this.receive({ type: 'welcome', protocolVersion: HUB_PROTOCOL_VERSION, sessionKind: 'owner-cookie', deviceId: null, heartbeatIntervalMs: 20_000, identity: IDENTITY, ...overrides });
  }
  drop(code = 1006): void { this.onclose?.({ code }); }
}

describe('Hub web collaboration transport (PD-100, PD-114)', () => {
  let sockets: FakeSocket[];
  let visible: boolean;
  let connection: { set: Mock<(state: string) => void> };
  let signIn: Mock<() => void>;
  let welcomes: CollabIdentity[];
  let downs: CollabLinkDown[];
  let controls: CollabLinkControl[];
  let frames: Uint8Array[];
  let link: CollabLink;
  const events: CollabLinkEvents = {
    welcome: (identity) => welcomes.push(identity),
    control: (message) => controls.push(message),
    frame: (data) => frames.push(data),
    down: (down) => downs.push(down),
  };

  const start = (): FakeSocket => {
    const transport = createHubCollabTransport({
      connection: connection as never,
      goToSignIn: signIn,
      openSocket: () => { const socket = new FakeSocket(); sockets.push(socket); return socket; },
      socketUrl: () => 'wss://hub.test/api/v1/collab',
      isVisible: () => visible,
    });
    link = transport.start(events);
    return sockets.at(-1)!;
  };
  const up = (): FakeSocket => {
    const socket = start();
    socket.open();
    socket.welcome();
    return socket;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    sockets = [];
    visible = true;
    connection = { set: vi.fn<(state: string) => void>() };
    signIn = vi.fn<() => void>();
    welcomes = [];
    downs = [];
    controls = [];
    frames = [];
  });
  afterEach(() => {
    link?.stop();
    vi.useRealTimers();
  });

  it('is edit-locked while down: Hub web writes are online-only', () => {
    expect(createHubCollabTransport({ connection: connection as never }).editableWhenDown).toBe(false);
  });

  it('opens a binary socket and says hello with this page protocol and a minimum of 3', () => {
    const socket = start();
    expect(socket.binaryType).toBe('arraybuffer');
    socket.open();
    expect(socket.json()).toEqual([{ type: 'hello', protocolVersion: HUB_PROTOCOL_VERSION, minHubProtocol: 3 }]);
    expect(COLLAB_MIN_HUB_PROTOCOL).toBe(3);
    expect(HUB_PROTOCOL_VERSION).toBeGreaterThanOrEqual(3);
  });

  it('reports the welcome identity, heartbeats at the announced interval and forwards controls and frames after it', () => {
    const socket = start();
    socket.open();
    // Nothing is forwarded or sent before the welcome.
    socket.receive({ type: 'subscribed', channel: 1, doc: 'room:a' });
    link.sendControl({ type: 'subscribe', channel: 1, doc: 'room:a' });
    link.sendFrame(new Uint8Array([1]));
    expect(controls).toHaveLength(0);
    expect(socket.sent).toHaveLength(1);

    socket.welcome();
    expect(welcomes).toEqual([IDENTITY]);
    vi.advanceTimersByTime(19_999);
    expect(socket.json().filter((m) => m['type'] === 'heartbeat')).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(socket.json().filter((m) => m['type'] === 'heartbeat')).toHaveLength(1);

    link.sendControl({ type: 'subscribe', channel: 2, doc: 'room:b' });
    const frame = new Uint8Array([2, 0, 1, 9]);
    link.sendFrame(frame);
    expect(socket.json().at(-1)).toEqual({ type: 'subscribe', channel: 2, doc: 'room:b' });
    expect(socket.sent.at(-1)).toBe(frame);

    socket.receive({ type: 'subscribed', channel: 2, doc: 'room:b' });
    socket.receive({ type: 'doc-error', channel: 2, code: 'too-large' });
    socket.receive({ type: 'surprise' });
    socket.receive({ type: 'doc-error', code: 'forbidden' });
    expect(controls).toEqual([{ type: 'subscribed', channel: 2, doc: 'room:b' }, { type: 'doc-error', channel: 2, code: 'too-large' }]);

    const buffer = new Uint8Array([5, 1, 0]).buffer;
    socket.onmessage?.({ data: buffer });
    expect(frames).toEqual([new Uint8Array([5, 1, 0])]);
  });

  it('treats a welcome without a usable identity as an incompatible Hub', () => {
    const socket = start();
    socket.open();
    socket.welcome({ identity: { deviceId: '', name: 'x', colorSlot: 99 } });
    expect(welcomes).toHaveLength(0);
    expect(downs).toEqual([{ kind: 'terminal', reason: 'incompatible' }]);
    expect(socket.closed).toBe(true);
  });

  describe('reconnect', () => {
    it('retries with exponential backoff from 1 s to 30 s and resets after a welcome', () => {
      const first = up();
      first.drop();
      expect(downs).toEqual([{ kind: 'retry' }]);
      expect(sockets).toHaveLength(1);
      vi.advanceTimersByTime(BACKOFF_MIN_MS - 1);
      expect(sockets).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(sockets).toHaveLength(2);

      // The welcome of that attempt resets the backoff to 1 s.
      sockets[1]!.open();
      sockets[1]!.welcome();
      sockets[1]!.drop();
      vi.advanceTimersByTime(BACKOFF_MIN_MS);
      expect(sockets).toHaveLength(3);

      // Failed attempts double: 1, 2, 4, 8, 16, 30, 30 s.
      let expected = 3;
      for (const wait of [2000, 4000, 8000, 16_000, BACKOFF_MAX_MS, BACKOFF_MAX_MS]) {
        sockets.at(-1)!.drop();
        vi.advanceTimersByTime(wait - 1);
        expect(sockets).toHaveLength(expected);
        vi.advanceTimersByTime(1);
        expected += 1;
        expect(sockets).toHaveLength(expected);
      }
    });

    it('waits for the tab to be visible before reconnecting', () => {
      const socket = up();
      visible = false;
      socket.drop();
      vi.advanceTimersByTime(BACKOFF_MIN_MS);
      vi.advanceTimersByTime(60_000);
      expect(sockets).toHaveLength(1);
      visible = true;
      document.dispatchEvent(new Event('visibilitychange'));
      expect(sockets).toHaveLength(2);
    });

    it('reports a socket that cannot even be created as a dropped link and retries', () => {
      const transport = createHubCollabTransport({
        connection: connection as never,
        openSocket: () => { throw new Error('blocked'); },
        socketUrl: () => 'wss://hub.test/api/v1/collab',
      });
      link = transport.start(events);
      expect(downs).toEqual([{ kind: 'retry' }]);
    });

    it('stop() closes the socket, cancels reconnecting and stays quiet', () => {
      const socket = up();
      socket.drop();
      link.stop();
      vi.advanceTimersByTime(60_000);
      expect(sockets).toHaveLength(1);
      expect(downs).toEqual([{ kind: 'retry' }]);

      const other = up();
      link.stop();
      expect(other.closed).toBe(true);
      other.drop(4004);
      expect(downs).toHaveLength(1);
    });
  });

  describe('close codes', () => {
    it.each([REALTIME_CLOSE_CODES.unauthorized, REALTIME_CLOSE_CODES.revoked])('%i expires the session: locks writes, goes to sign-in, never reconnects', (code) => {
      const socket = up();
      socket.drop(code);
      expect(connection.set).toHaveBeenCalledWith('session-expired');
      expect(signIn).toHaveBeenCalledTimes(1);
      expect(downs).toEqual([{ kind: 'terminal', reason: 'session-expired' }]);
      vi.advanceTimersByTime(120_000);
      expect(sockets).toHaveLength(1);
    });

    it('4004 marks the Hub transferred for good', () => {
      const socket = up();
      socket.drop(REALTIME_CLOSE_CODES.transferred);
      expect(connection.set).toHaveBeenCalledWith('transferred');
      expect(downs).toEqual([{ kind: 'terminal', reason: 'transferred' }]);
      expect(signIn).not.toHaveBeenCalled();
      vi.advanceTimersByTime(120_000);
      expect(sockets).toHaveLength(1);
    });

    it('4008 marks the page and the Hub incompatible', () => {
      const socket = up();
      socket.drop(REALTIME_CLOSE_CODES.unsupportedProtocol);
      expect(connection.set).toHaveBeenCalledWith('incompatible');
      expect(downs).toEqual([{ kind: 'terminal', reason: 'incompatible' }]);
      vi.advanceTimersByTime(120_000);
      expect(sockets).toHaveLength(1);
    });

    it.each([REALTIME_CLOSE_CODES.rateLimited, 1013, 1006, 1001])('%i is a dropped link: retried, state untouched', (code) => {
      const socket = up();
      socket.drop(code);
      expect(connection.set).not.toHaveBeenCalled();
      expect(downs).toEqual([{ kind: 'retry' }]);
      vi.advanceTimersByTime(BACKOFF_MIN_MS);
      expect(sockets).toHaveLength(2);
    });
  });
});
