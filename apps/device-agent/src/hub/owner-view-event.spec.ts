import { EventEmitter } from 'node:events';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { OwnerViewTopic } from '@dude/contracts/hub';
import { fakeDpapi, startAgent, startHub, stopAgents, waitFor } from '../testing/hub-harness.js';
import type { Agent, HubHandle } from '../testing/hub-harness.js';
import { cleanupTemp } from '../testing/test-utils.js';

/** The agent's realtime socket is replaced by a scripted one (HTTP still talks to a real Hub), so events can be delivered directly. */
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

const sockets = (): EventEmitter[] => fake.sockets as EventEmitter[];
const deliver = (socket: EventEmitter, message: unknown): void => { socket.emit('message', Buffer.from(JSON.stringify(message)), false); };
const welcome = (socket: EventEmitter): void => deliver(socket, {
  type: 'welcome', protocolVersion: 3, sessionKind: 'device', deviceId: null, heartbeatIntervalMs: 60_000,
  tls: { spkiSha256: 'A'.repeat(43), nextSpkiSha256: null },
});
const viewChanged = (socket: EventEmitter, topic: unknown): void => deliver(socket, { type: 'event', event: 'owner-view-changed', data: { topic } });

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

describe('device agent owner-view-changed (PD-113)', { timeout: 60_000 }, () => {
  it('surfaces a known topic to listeners and ignores unknown or malformed ones', async () => {
    const socket = sockets()[0]!;
    welcome(socket);
    await waitFor('online', () => agent.hub.manager.status().state === 'online');
    const seen: OwnerViewTopic[] = [];
    const off = agent.hub.manager.onOwnerViewChanged((topic) => seen.push(topic));
    viewChanged(socket, 'devices');
    viewChanged(socket, 'backup');
    viewChanged(socket, 'passwords');
    viewChanged(socket, 7);
    viewChanged(socket, undefined);
    deliver(socket, { type: 'event', event: 'owner-view-changed', data: {} });
    expect(seen).toEqual(['devices', 'backup']);
    off();
    viewChanged(socket, 'sync');
    expect(seen).toEqual(['devices', 'backup']);
    expect(agent.hub.manager.status().state).toBe('online');
  });

  it('a throwing listener does not break the connection or other listeners', () => {
    const socket = sockets()[0]!;
    const seen: OwnerViewTopic[] = [];
    const offBad = agent.hub.manager.onOwnerViewChanged(() => { throw new Error('boom'); });
    const offGood = agent.hub.manager.onOwnerViewChanged((topic) => seen.push(topic));
    viewChanged(socket, 'alerts');
    expect(seen).toEqual(['alerts']);
    offBad();
    offGood();
  });
});
