import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PresenceEntry } from '@dude/contracts/hub';
import { fakeDpapi, startAgent, startHub, stopAgents, waitFor } from '../testing/hub-harness.js';
import type { Agent, HubHandle } from '../testing/hub-harness.js';
import { cleanupTemp } from '../testing/test-utils.js';

/**
 * PD-108 end to end: the renderer's activity reaches the Hub through the agent's realtime socket (a real Hub process, a real agent),
 * is remembered across a reconnect, is cleared with null, and never needs the owner. Gating against an older Hub is `presence-gating.spec.ts`.
 */
const PASSWORD = 'correct horse battery staple';

let hub: HubHandle;
let agent: Agent;

const mine = async (): Promise<PresenceEntry | undefined> => (await agent.rpc('hub.owner.presence', {})).entries.find((e) => e.deviceId === agent.store.device.deviceId);

beforeAll(async () => {
  hub = await startHub({ bootstrap: { password: PASSWORD } });
  agent = startAgent(fakeDpapi());
}, 90_000);

afterAll(async () => {
  stopAgents();
  await hub?.dispose();
  cleanupTemp();
}, 30_000);

describe('device agent presence', { timeout: 60_000 }, () => {
  it('rejects a malformed activity before it reaches the manager', async () => {
    for (const activity of [{ kind: 'tool', id: 'Not A Tool' }, { kind: 'destination', id: 'nope' }, { kind: 'tool', id: 'base64', extra: 1 }, 'home', undefined] as never[]) {
      await expect(agent.rpc('presence.setActivity', { activity })).rejects.toMatchObject({ code: 'invalid-params' });
    }
  });

  it('remembers an activity set before the device is online and sends it after the welcome', async () => {
    await expect(agent.rpc('presence.setActivity', { activity: { kind: 'tool', id: 'base64' } })).resolves.toEqual({ ok: true });
    await agent.rpc('hub.enroll', { pairingString: await hub.pairingString(PASSWORD) });
    await waitFor('online', () => agent.hub.manager.status().state === 'online');
    await agent.rpc('hub.owner.signIn', { password: PASSWORD });
    await waitFor('activity on the Hub', async () => (await mine())?.activity?.id === 'base64');
    expect(await mine()).toMatchObject({ online: true, activity: { kind: 'tool', id: 'base64' } });
  });

  it('updates and clears the activity while connected', async () => {
    await agent.rpc('presence.setActivity', { activity: { kind: 'destination', id: 'settings' } });
    await waitFor('destination', async () => (await mine())?.activity?.kind === 'destination');
    expect((await mine())?.activity).toEqual({ kind: 'destination', id: 'settings' });
    await agent.rpc('presence.setActivity', { activity: null });
    await waitFor('cleared', async () => (await mine())?.activity === null);
    expect(await mine()).toMatchObject({ online: true, activity: null });
  });

  it('sends the remembered activity again after a reconnect', async () => {
    await agent.rpc('presence.setActivity', { activity: { kind: 'tool', id: 'base64' } });
    await waitFor('activity', async () => (await mine())?.activity?.id === 'base64');
    // Restarting the connection loop drops the socket (the Hub forgets its activity and the agent forgets the owner bearer) and opens a new one.
    agent.hub.manager.stop();
    agent.hub.manager.start();
    await waitFor('online again', () => agent.hub.manager.status().state === 'online');
    await agent.rpc('hub.owner.signIn', { password: PASSWORD });
    await waitFor('activity restored', async () => (await mine())?.activity?.id === 'base64');
  });

  it('forgets the remembered activity when the device leaves the Hub', async () => {
    await agent.rpc('hub.unenroll', {});
    await agent.rpc('hub.enroll', { pairingString: await hub.pairingString(PASSWORD) });
    await waitFor('online', () => agent.hub.manager.status().state === 'online');
    await agent.rpc('hub.owner.signIn', { password: PASSWORD });
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect((await mine())?.activity ?? null).toBeNull();
  });
});
