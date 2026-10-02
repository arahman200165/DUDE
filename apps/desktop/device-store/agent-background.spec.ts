vi.mock('electron', () => ({ app: { getPath: () => 'C:/ud', isPackaged: false } }));

import { createAgentBackground, decodeAutostartDoc } from './agent-background';
import type { AgentAutostartState } from './agent-autostart';
import type { DeviceStoreHost } from './agent-host';

function setup(options: { packaged?: boolean; saved?: boolean | null; setOk?: boolean; state?: AgentAutostartState } = {}) {
  let state: AgentAutostartState = options.state ?? { status: 'disabled' };
  const saved: boolean[] = [];
  const setCalls: boolean[] = [];
  const host = { agentRunning: vi.fn(() => true), stoppedByUser: vi.fn(() => false), stopAgent: vi.fn(async () => undefined), retry: vi.fn(async () => undefined) };
  const background = createAgentBackground({
    isPackaged: options.packaged ?? true,
    autostart: {
      get: async () => state,
      set: async (enabled) => {
        setCalls.push(enabled);
        if (options.setOk === false) return { ok: false, error: 'denied' };
        state = enabled ? { status: 'enabled', mechanism: 'run-key' } : { status: 'disabled' };
        return { ok: true, state };
      },
    },
    host: () => host as unknown as DeviceStoreHost,
    loadPreference: async () => options.saved ?? null,
    savePreference: async (enabled) => { saved.push(enabled); },
  });
  return { background, host, saved, setCalls };
}

describe('agent background', () => {
  it('first packaged run defaults to on: installs the entry and saves the choice', async () => {
    const { background, saved, setCalls } = setup({ saved: null });
    await background.init();
    expect(setCalls).toEqual([true]);
    expect(saved).toEqual([true]);
    expect(background.keepAgentRunning()).toBe(true);
  });

  it('a later run honours the saved off choice and installs nothing', async () => {
    const { background, setCalls } = setup({ saved: false });
    await background.init();
    expect(setCalls).toEqual([]);
    expect(background.keepAgentRunning()).toBe(false);
  });

  it('a later run with the choice on re-registers the entry', async () => {
    const { background, setCalls } = setup({ saved: true });
    await background.init();
    expect(setCalls).toEqual([true]);
    expect(background.keepAgentRunning()).toBe(true);
  });

  it('an unpackaged build never installs and never keeps the agent running', async () => {
    const { background, setCalls, saved } = setup({ packaged: false, saved: true });
    await background.init();
    expect(setCalls).toEqual([]);
    expect(saved).toEqual([]);
    expect(background.keepAgentRunning()).toBe(false);
    expect(await background.setAutostart(true)).toMatchObject({ ok: false });
    expect(setCalls).toEqual([]);
  });

  it('a failed first-run install leaves the choice undecided so the next run retries', async () => {
    const { background, saved } = setup({ saved: null, setOk: false });
    await background.init();
    expect(saved).toEqual([]);
    expect(background.keepAgentRunning()).toBe(false);
  });

  it('toggling saves the choice only after the change succeeded, and reports the mechanism', async () => {
    const ok = setup({ saved: false });
    await ok.background.init();
    expect(await ok.background.setAutostart(true)).toEqual({ ok: true, status: { running: true, stoppedByUser: false, autostart: 'enabled', mechanism: 'run-key' } });
    expect(ok.saved).toEqual([true]);
    expect(ok.background.keepAgentRunning()).toBe(true);
    expect(await ok.background.setAutostart(false)).toMatchObject({ ok: true, status: { autostart: 'disabled', mechanism: null } });
    expect(ok.background.keepAgentRunning()).toBe(false);

    const denied = setup({ saved: false, setOk: false });
    await denied.background.init();
    expect(await denied.background.setAutostart(true)).toEqual({ ok: false, error: 'denied' });
    expect(denied.saved).toEqual([]);
    expect(denied.background.keepAgentRunning()).toBe(false);
  });

  it('stop asks the host to stop the agent and start calls retry', async () => {
    const { background, host } = setup();
    host.agentRunning.mockReturnValue(false);
    host.stoppedByUser.mockReturnValue(true);
    expect(await background.stop()).toMatchObject({ ok: true, status: { running: false, stoppedByUser: true } });
    expect(host.stopAgent).toHaveBeenCalledTimes(1);
    expect(await background.start()).toMatchObject({ ok: true });
    expect(host.retry).toHaveBeenCalledTimes(1);
  });

  it('decodes the saved doc strictly', () => {
    expect(decodeAutostartDoc({ enabled: true })).toBe(true);
    expect(decodeAutostartDoc({ enabled: 'yes' })).toBeNull();
    expect(decodeAutostartDoc(null)).toBeNull();
  });
});
