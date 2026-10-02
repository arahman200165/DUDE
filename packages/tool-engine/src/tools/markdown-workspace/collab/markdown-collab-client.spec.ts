import { MarkdownCollabClient } from "./markdown-collab-client.js";

/**
 * A minimal fake WebSocket that pairs two instances constructed with the
 * same URL and relays `send()` on one as a `message` event on the other —
 * enough to exercise `MarkdownCollabClient`'s real sync/awareness protocol
 * handling (it's symmetric: each side runs the same `readSyncMessage`
 * logic a real server would) without needing `apps/desktop/collab-server.ts`'s
 * actual apps/collab-relay/broadcast semantics, which is exercised live instead.
 */
class FakeSocketHub {
  private readonly byUrl = new Map<string, FakeWebSocket[]>();

  register(socket: FakeWebSocket): void {
    const list = this.byUrl.get(socket.url) ?? [];
    list.push(socket);
    this.byUrl.set(socket.url, list);
  }

  peersOf(socket: FakeWebSocket): readonly FakeWebSocket[] {
    return (this.byUrl.get(socket.url) ?? []).filter((s) => s !== socket);
  }
}

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;

  readyState = FakeWebSocket.CONNECTING;
  binaryType = '';
  private readonly listeners = new Map<string, ((event: { data?: unknown }) => void)[]>();

  constructor(
    readonly url: string,
    private readonly hub: FakeSocketHub,
  ) {
    hub.register(this);
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.OPEN;
      this.dispatch('open', {});
    });
  }

  addEventListener(type: string, callback: (event: { data?: unknown }) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(callback);
    this.listeners.set(type, list);
  }

  send(data: ArrayBuffer): void {
    for (const peer of this.hub.peersOf(this)) {
      queueMicrotask(() => peer.dispatch('message', { data }));
    }
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatch('close', {});
  }

  private dispatch(type: string, event: { data?: unknown }): void {
    for (const callback of this.listeners.get(type) ?? []) callback(event);
  }
}

async function flush(): Promise<void> {
  // Several message round-trips (sync step1 -> step2 -> update broadcasts)
  // each take one microtask hop; a handful of flushes drains the chain.
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe('MarkdownCollabClient', () => {
  const originalWebSocket = globalThis.WebSocket;
  let hub: FakeSocketHub;

  beforeEach(() => {
    hub = new FakeSocketHub();
    vi.stubGlobal(
      'WebSocket',
      class extends FakeWebSocket {
        constructor(url: string) {
          super(url, hub);
        }
      },
    );
  });

  afterEach(() => {
    vi.stubGlobal('WebSocket', originalWebSocket);
  });

  it('applies a local edit without treating it as a remote change', async () => {
    const remoteChanges: string[] = [];
    const client = new MarkdownCollabClient({
      url: 'ws://127.0.0.1:1',
      sessionCode: 'code',
      initialText: 'hello',
      onRemoteTextChange: (text) => remoteChanges.push(text),
      onStatusChange: () => {},
      onParticipantCountChange: () => {},
    });

    await flush();
    client.applyLocalEdit('hello world');

    expect(client.getText()).toBe('hello world');
    expect(remoteChanges).toEqual([]);
    client.destroy();
  });

  it('the host seeds the doc, and a joiner (empty initialText) adopts it rather than seeding its own', async () => {
    const bRemote: string[] = [];

    const host = new MarkdownCollabClient({
      url: 'ws://127.0.0.1:2',
      sessionCode: 'code',
      initialText: 'from host',
      onRemoteTextChange: () => {},
      onStatusChange: () => {},
      onParticipantCountChange: () => {},
    });
    await flush();

    const joiner = new MarkdownCollabClient({
      url: 'ws://127.0.0.1:2',
      sessionCode: 'code',
      initialText: '',
      onRemoteTextChange: (text) => bRemote.push(text),
      onStatusChange: () => {},
      onParticipantCountChange: () => {},
    });
    await flush();

    expect(host.getText()).toBe('from host');
    expect(joiner.getText()).toBe('from host');
    expect(bRemote).toContain('from host');

    host.destroy();
    joiner.destroy();
  });

  it('propagates a local edit on one client to the other as a remote change', async () => {
    const bRemote: string[] = [];

    const clientA = new MarkdownCollabClient({
      url: 'ws://127.0.0.1:3',
      sessionCode: 'code',
      initialText: 'shared',
      onRemoteTextChange: () => {},
      onStatusChange: () => {},
      onParticipantCountChange: () => {},
    });
    const clientB = new MarkdownCollabClient({
      url: 'ws://127.0.0.1:3',
      sessionCode: 'code',
      initialText: '',
      onRemoteTextChange: (text) => bRemote.push(text),
      onStatusChange: () => {},
      onParticipantCountChange: () => {},
    });
    await flush();

    clientA.applyLocalEdit('shared and edited');
    await flush();

    expect(clientB.getText()).toBe('shared and edited');
    expect(bRemote.at(-1)).toBe('shared and edited');

    clientA.destroy();
    clientB.destroy();
  });

  it('reports connection status transitions', async () => {
    const statuses: string[] = [];
    const client = new MarkdownCollabClient({
      url: 'ws://127.0.0.1:4',
      sessionCode: 'code',
      initialText: '',
      onRemoteTextChange: () => {},
      onStatusChange: (status) => statuses.push(status),
      onParticipantCountChange: () => {},
    });

    expect(statuses[0]).toBe('connecting');
    await flush();
    expect(statuses).toContain('connected');

    client.destroy();
    expect(statuses.at(-1)).toBe('disconnected');
  });
});
