import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CollabRelayFrame } from '@dude/contracts';
import { fakeDpapi, startAgent, startHub, stopAgents, waitFor } from '../testing/hub-harness.js';
import type { Agent, HubHandle } from '../testing/hub-harness.js';
import { setReconcileRequired } from '../store/repos/sync-state.repo.js';
import { cleanupTemp } from '../testing/test-utils.js';

/**
 * PD-106 end to end: a desktop (the harness holder) co-edits through the Agent relay against a real Hub process. The raw y-protocols peer is a pair of
 * hand-built frames, so this spec needs neither Yjs nor `@dude/collab-doc` (the Agent depends on neither). A frame is
 * `[varUint channel][varUint kind][varUint8Array payload]` and a sync payload is `[syncStep1 | syncStep2 | update][payload]`:
 * - `UPDATE_CH1` is channel 1, kind 0 (sync), an update message for a Y.Doc (client 4242) that inserts "hello via the agent relay" into the
 *   Y.Text `markdown` (the text a Markdown room holds);
 * - `STEP1_CH2` is channel 2, kind 0, a sync step 1 carrying an empty state vector.
 */
const PASSWORD = 'correct horse battery staple';
const UPDATE_CH1 = 'AQAtAisBAZIhAAQBCG1hcmtkb3duGWhlbGxvIHZpYSB0aGUgYWdlbnQgcmVsYXkA';
const STEP1_CH2 = 'AgADAAEA';
const TEXT = 'hello via the agent relay';

let hub: HubHandle;
let agent: Agent;

const control = (message: unknown): CollabRelayFrame => ({ kind: 'control', text: JSON.stringify(message) });
const controls = (): Array<Record<string, unknown>> => agent.collab.frames.filter((f) => f.kind === 'control').map((f) => JSON.parse((f as { text: string }).text) as Record<string, unknown>);
const binaries = (): Buffer[] => agent.collab.frames.filter((f) => f.kind === 'binary').map((f) => Buffer.from((f as { base64: string }).base64, 'base64'));
const lastState = (): string | undefined => agent.collab.states.at(-1)?.state;

async function firstSync(): Promise<void> {
  const preview = await agent.rpc('sync.firstSync.preview', {});
  await agent.rpc('sync.firstSync.apply', {
    choices: { 'workspace-layout': 'merge', scratchpad: 'merge', usage: 'merge' }, digest: preview.digest, ...(preview.confirmToken ? { confirmToken: preview.confirmToken } : {}),
  });
}

beforeAll(async () => {
  hub = await startHub({ bootstrap: { password: PASSWORD } });
  agent = startAgent(fakeDpapi(), { collabTimings: { backoffMinMs: 200, backoffMaxMs: 1_000, lingerMs: 400 } });
}, 90_000);

afterAll(async () => {
  stopAgents();
  await hub?.dispose();
  cleanupTemp();
}, 30_000);

describe('device agent collaboration relay', { timeout: 90_000 }, () => {
  it('refuses while the device is not paired, then while the first sync is pending', async () => {
    expect(await agent.rpc('collab.open', {})).toMatchObject({ ok: false, reason: 'not-enrolled' });
    await agent.rpc('hub.enroll', { pairingString: await hub.pairingString(PASSWORD) });
    await waitFor('online', () => agent.hub.manager.status().state === 'online');
    expect(await agent.rpc('collab.open', {})).toMatchObject({ ok: false, reason: 'first-sync-pending' });
    expect(agent.hub.collab.active()).toBe(false);
    expect(agent.collab.states).toEqual([]);
  });

  it('opens once the gate holds and hands the renderer the Hub welcome', async () => {
    await firstSync();
    expect(await agent.rpc('collab.open', {})).toEqual({ ok: true });
    await waitFor('relay open', () => lastState() === 'open');
    const welcome = controls().find((m) => m['type'] === 'welcome');
    expect(welcome).toMatchObject({ sessionKind: 'device', deviceId: agent.store.device.deviceId, identity: { deviceId: agent.store.device.deviceId } });
    expect(agent.collab.states.map((s) => s.state)).toEqual(['connecting', 'open']);
  });

  it('refuses frames the renderer may not send before they reach the Hub', async () => {
    for (const frame of [control({ type: 'hello', protocolVersion: 3, minHubProtocol: 3 }), control({ type: 'heartbeat' }), { kind: 'binary', base64: 'AA==' }, { kind: 'control', text: 'x' }] satisfies CollabRelayFrame[]) {
      await expect(agent.rpc('collab.send', frame)).rejects.toMatchObject({ code: 'invalid-params' });
    }
  });

  it('subscribes to a room and relays a document update that another subscription then reads back', async () => {
    const headers = await hub.ownerHeaders(PASSWORD);
    const created = await hub.request('POST', '/api/v1/collab/rooms', { name: 'Relay' }, headers);
    expect(created.status).toBe(201);
    const doc = `room:${String(created.body['id'])}`;

    await agent.rpc('collab.send', control({ type: 'subscribe', channel: 1, doc }));
    await waitFor('subscribed', () => controls().find((m) => m['type'] === 'subscribed' && m['channel'] === 1));
    await agent.rpc('collab.send', { kind: 'binary', base64: UPDATE_CH1 });

    // A second subscription to the same document gets the Hub's state through its step 2 reply.
    await agent.rpc('collab.send', control({ type: 'unsubscribe', channel: 1 }));
    await agent.rpc('collab.send', control({ type: 'subscribe', channel: 2, doc }));
    await waitFor('subscribed again', () => controls().find((m) => m['type'] === 'subscribed' && m['channel'] === 2));
    await agent.rpc('collab.send', { kind: 'binary', base64: STEP1_CH2 });
    const reply = await waitFor('the Hub state on channel 2', () => binaries().find((b) => b[0] === 2 && b[1] === 0 && b.includes(Buffer.from(TEXT))));
    expect(reply.includes(Buffer.from(TEXT))).toBe(true);
  });

  it('answers a document the Hub refuses with its doc-error, relayed unchanged', async () => {
    await agent.rpc('collab.send', control({ type: 'subscribe', channel: 3, doc: 'room:doesnotexist' }));
    const refused = await waitFor('doc-error', () => controls().find((m) => m['type'] === 'doc-error' && m['channel'] === 3));
    expect(refused).toMatchObject({ code: expect.any(String) });
  });

  it('reconnects by itself after the Hub restarts and is welcomed again', async () => {
    const welcomes = controls().filter((m) => m['type'] === 'welcome').length;
    await hub.restart();
    await waitFor('retrying', () => agent.collab.states.some((s) => s.state === 'closed' && s.willRetry === true), 30_000);
    await waitFor('online again', () => agent.hub.manager.status().state === 'online', 30_000);
    await waitFor('open again', () => lastState() === 'open' && controls().filter((m) => m['type'] === 'welcome').length > welcomes, 30_000);
    // The restarted Hub knows no subscriptions: the renderer subscribes again on the new connection.
    await agent.rpc('collab.send', control({ type: 'subscribe', channel: 1, doc: 'room:doesnotexist' }));
    await waitFor('the Hub answers on the new socket', () => controls().filter((m) => m['type'] === 'doc-error' && m['channel'] === 1).length > 0);
  });

  it('stops the socket and ends the hold when the gate stops holding for a reason that needs the user', async () => {
    setReconcileRequired(agent.store.db, 'cursor-ahead', new Date());
    agent.hub.collab.recheck();
    expect(agent.collab.states.at(-1)).toEqual({ state: 'closed', reason: 'needs-reconcile', willRetry: false });
    expect(agent.hub.collab.active()).toBe(false);
    expect(await agent.rpc('collab.open', {})).toMatchObject({ ok: false, reason: 'needs-reconcile' });
    await expect(agent.rpc('collab.send', control({ type: 'unsubscribe', channel: 1 }))).rejects.toMatchObject({ code: 'collab-not-open' });
  });
});
