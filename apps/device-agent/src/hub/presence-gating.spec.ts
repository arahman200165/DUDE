import { EventEmitter } from 'node:events';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { fakeDpapi, startAgent, startHub, stopAgents, waitFor } from '../testing/hub-harness.js';
import type { Agent, HubHandle } from '../testing/hub-harness.js';
import { cleanupTemp } from '../testing/test-utils.js';

/** The agent's realtime socket is replaced by a scripted one (HTTP still talks to a real Hub), so the welcome's protocol version can be chosen. */
const fake = vi.hoisted(() => ({ sockets: [] as unknown[] }));
vi.mock('ws', async () => {
  const { EventEmitter: Emitter } = await import('node:events');
  class FakeWebSocket extends Emitter {
    static OPEN = 1;
    readyState = 1;
    sent: unknown[] = [];
    constructor() {
      super();
      fake.sockets.push(this);
      queueMicrotask(() => this.emit('open'));
    }
    send(data: string): void { this.sent.push(JSON.parse(data)); }
    ping(): void { /* heartbeat */ }
    terminate(): void { this.readyState = 3; }
  }
  return { WebSocket: FakeWebSocket, default: FakeWebSocket };
});

interface Scripted extends EventEmitter { sent: Array<{ type: string; activity?: unknown }> }
const sockets = (): Scripted[] => fake.sockets as Scripted[];
const welcome = (socket: Scripted, protocolVersion: number): void => {
  socket.emit('message', Buffer.from(JSON.stringify({
    type: 'welcome', protocolVersion, sessionKind: 'device', deviceId: null, heartbeatIntervalMs: 60_000,
    tls: { spkiSha256: 'A'.repeat(43), nextSpkiSha256: null },
  })), false);
};
const activities = (socket: Scripted): unknown[] => socket.sent.filter((m) => m.type === 'activity').map((m) => m.activity);

const PASSWORD = 'correct horse battery staple';
let hub: HubHandle;
let agent: Agent;

beforeAll(async () => {
  hub = await startHub({ bootstrap: { password: PASSWORD } });
  agent = startAgent(fakeDpapi());
  await agent.rpc('hub.enroll', { pairingString: await hub.pairingString(PASSWORD) });
  await waitFor('first socket', () => sockets().length >= 1);
}, 90_000);

afterAll(async () => {
  stopAgents();
  await hub?.dispose();
  cleanupTemp();
}, 30_000);

describe('device agent activity gating', { timeout: 60_000 }, () => {
  const tool = { kind: 'tool', id: 'base64' } as const;
  const destination = { kind: 'destination', id: 'settings' } as const;

  it('sends nothing before a welcome and nothing to a protocol 2 Hub', async () => {
    const first = sockets()[0]!;
    await waitFor('hello', () => first.sent.some((m) => m.type === 'hello'));
    agent.hub.manager.setActivity(tool);
    expect(activities(first)).toEqual([]);
    welcome(first, 2);
    await waitFor('online', () => agent.hub.manager.status().state === 'online');
    agent.hub.manager.setActivity(destination);
    agent.hub.manager.setActivity(null);
    agent.hub.manager.setActivity(destination);
    expect(activities(first)).toEqual([]);
  });

  it('sends the latest remembered activity after the welcome of a protocol 3 Hub, then every change', async () => {
    const before = sockets().length;
    sockets()[before - 1]!.emit('close', 1006);
    const second = await waitFor('reconnect', () => (sockets().length > before ? sockets()[sockets().length - 1] : undefined));
    await waitFor('hello', () => second.sent.some((m) => m.type === 'hello'));
    expect(activities(second)).toEqual([]);
    welcome(second, 3);
    expect(activities(second)).toEqual([destination]);
    agent.hub.manager.setActivity(null);
    agent.hub.manager.setActivity(tool);
    expect(activities(second)).toEqual([destination, null, tool]);
  });

  it('sends the latest value again after the next reconnect', async () => {
    const before = sockets().length;
    sockets()[before - 1]!.emit('close', 1006);
    const third = await waitFor('reconnect', () => (sockets().length > before ? sockets()[sockets().length - 1] : undefined));
    await waitFor('hello', () => third.sent.some((m) => m.type === 'hello'));
    welcome(third, 3);
    expect(activities(third)).toEqual([tool]);
  });
});
