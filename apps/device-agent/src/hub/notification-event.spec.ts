import { EventEmitter } from 'node:events';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { NotificationEventData } from '@dude/contracts/hub';
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
const notification = (socket: EventEmitter, data: unknown): void => deliver(socket, { type: 'event', event: 'notification', data });

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

describe('device agent notification event (PD-109, PD-110)', { timeout: 60_000 }, () => {
  it('surfaces a well-formed notification to listeners and ignores malformed payloads', async () => {
    const socket = sockets()[0]!;
    welcome(socket);
    await waitFor('online', () => agent.hub.manager.status().state === 'online');
    const seen: NotificationEventData[] = [];
    const off = agent.hub.manager.onNotification((event) => seen.push(event));
    const good = { id: 'n1', kind: 'backup-failed', severity: 'error', title: 'Backup failed' };
    notification(socket, good);
    notification(socket, { ...good, id: '' });
    notification(socket, { ...good, kind: 'something-else' });
    notification(socket, { ...good, severity: 'fatal' });
    notification(socket, { ...good, title: 'x'.repeat(121) });
    notification(socket, { id: 'n2' });
    notification(socket, {});
    expect(seen).toEqual([good]);
    off();
    notification(socket, good);
    expect(seen).toHaveLength(1);
    expect(agent.hub.manager.status().state).toBe('online');
  });

  it('a throwing listener does not break the connection or other listeners', () => {
    const socket = sockets()[0]!;
    const seen: NotificationEventData[] = [];
    const offBad = agent.hub.manager.onNotification(() => { throw new Error('boom'); });
    const offGood = agent.hub.manager.onNotification((event) => seen.push(event));
    notification(socket, { id: 'n3', kind: 'tls-renewed', severity: 'info', title: 'Certificate renewed' });
    expect(seen.map((event) => event.id)).toEqual(['n3']);
    offBad();
    offGood();
  });
});
