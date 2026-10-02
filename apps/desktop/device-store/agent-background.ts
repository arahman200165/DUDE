import { app } from 'electron';
import type { BackgroundAgentResult, BackgroundAgentStatus } from '@dude/contracts';
import { configureAgentAutostart, getAgentAutostart, setAgentAutostart } from './agent-autostart';
import type { AgentAutostartState, AutostartSetResult } from './agent-autostart';
import { deviceStoreDir } from './agent-host';
import type { DeviceStoreHost } from './agent-host';
import { resolveAgentLaunch } from './agent-transport';
import { loadDoc, saveDoc } from './device-docs';
import { getDeviceStoreHost } from './store-client';

/**
 * The resident Device Agent as the user sees it (PD-026): whether it starts at sign-in, whether it
 * keeps running after the window closes, and the Settings > This Device start/stop actions. The
 * "start at sign-in" choice is the `agent-autostart` device doc. A packaged build defaults it to on
 * at its first run; an unpackaged build never installs a sign-in entry and always shuts the agent
 * down on quit.
 */

const DOC = 'agent-autostart';
const DEV_ONLY = 'Starting at sign-in is not available in a development build.';

export interface AgentBackgroundDeps {
  isPackaged: boolean;
  autostart: { get(): Promise<AgentAutostartState>; set(enabled: boolean): Promise<AutostartSetResult> };
  host: () => DeviceStoreHost | null;
  loadPreference: () => Promise<boolean | null>;
  savePreference: (enabled: boolean) => Promise<void>;
}

export interface AgentBackground {
  /** Reads the saved choice, applies the first-run default and re-registers the sign-in entry (best effort, never throws). */
  init(): Promise<void>;
  /** Quit detaches from the agent instead of stopping it. */
  keepAgentRunning(): boolean;
  status(): Promise<BackgroundAgentStatus>;
  setAutostart(enabled: boolean): Promise<BackgroundAgentResult>;
  stop(): Promise<BackgroundAgentResult>;
  start(): Promise<BackgroundAgentResult>;
}

export function decodeAutostartDoc(raw: unknown): boolean | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const enabled = (raw as Record<string, unknown>)['enabled'];
  return typeof enabled === 'boolean' ? enabled : null;
}

export function createAgentBackground(deps: AgentBackgroundDeps): AgentBackground {
  let preference: boolean | null = null;

  async function status(): Promise<BackgroundAgentStatus> {
    const host = deps.host();
    const state = await deps.autostart.get().catch((): AgentAutostartState => ({ status: 'disabled' }));
    return {
      running: host?.agentRunning() ?? false,
      stoppedByUser: host?.stoppedByUser() ?? false,
      autostart: state.status,
      mechanism: state.status === 'enabled' ? state.mechanism : null,
    };
  }

  const failure = (error: string): BackgroundAgentResult => ({ ok: false, error });

  return {
    async init() {
      try {
        preference = await deps.loadPreference();
        if (!deps.isPackaged) return;
        if (preference === null) {
          const result = await deps.autostart.set(true);
          if (result.ok) { preference = true; await deps.savePreference(true); }
          return;
        }
        // Re-register so the entry follows the executable if the app was moved or updated.
        if (preference) await deps.autostart.set(true);
      } catch { /* the background agent is optional; startup never depends on it */ }
    },

    keepAgentRunning: () => deps.isPackaged && preference === true,

    status,

    async setAutostart(enabled) {
      if (typeof enabled !== 'boolean') return failure('Invalid request.');
      if (!deps.isPackaged) return failure(DEV_ONLY);
      const result = await deps.autostart.set(enabled).catch((): AutostartSetResult => ({ ok: false, error: 'The change did not complete.' }));
      if (!result.ok) return failure(result.error);
      preference = enabled;
      await deps.savePreference(enabled).catch(() => undefined);
      return { ok: true, status: await status() };
    },

    async stop() {
      const host = deps.host();
      if (!host) return failure('The device store is not running.');
      try { await host.stopAgent(); } catch { return failure('The background agent did not stop.'); }
      return { ok: true, status: await status() };
    },

    async start() {
      const host = deps.host();
      if (!host) return failure('The device store is not running.');
      try { await host.retry(); } catch { return failure('The background agent did not start.'); }
      return { ok: true, status: await status() };
    },
  };
}

let installed: AgentBackground | null = null;

/** Main's instance, built on first use from Electron's app state. */
export function getAgentBackground(): AgentBackground {
  if (installed) return installed;
  const storeDir = deviceStoreDir(app.getPath('userData'));
  const agentExe = app.isPackaged
    ? resolveAgentLaunch({ isPackaged: true, resourcesPath: process.resourcesPath, execPath: process.execPath, scriptDir: __dirname, platform: process.platform }, storeDir).command
    : null;
  configureAgentAutostart({ storeDir, agentExe });
  installed = createAgentBackground({
    isPackaged: app.isPackaged,
    autostart: { get: getAgentAutostart, set: setAgentAutostart },
    host: getDeviceStoreHost,
    loadPreference: () => loadDoc<boolean | null>(DOC, decodeAutostartDoc, null),
    savePreference: (enabled) => saveDoc(DOC, { enabled }),
  });
  return installed;
}
