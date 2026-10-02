import type { AgentHubBootstrapResult, AgentHubProbe, AgentHubStatus } from '@dude/contracts';
import type { Db } from '@dude/sqlite-store';
import type { DpapiPort } from '../native/windows-sys-client.js';
import { bootstrapLocalHub } from './bootstrap-local.js';
import type { BootstrapLocalDeps, BootstrapLocalParams } from './bootstrap-local.js';
import { enrollDevice } from './enroll.js';
import { createHubConnectionManager } from './hub-client.js';
import type { HubConnectionManager, HubManagerDeps } from './hub-client.js';
import { probeLocalHub } from './probe.js';

export interface HubRuntimeDeps extends Pick<HubManagerDeps, 'now' | 'device' | 'timings' | 'random' | 'createTransport'> {
  db: Db;
  dpapi: DpapiPort;
  /** Test seam: where the hand-off file lives (default `%LOCALAPPDATA%`). */
  localAppData?: BootstrapLocalDeps['localAppData'];
}

/** Everything the RPC layer needs for the Hub: the connection manager plus pairing and local discovery. */
export interface HubRuntime {
  manager: HubConnectionManager;
  enroll(pairingString: string): Promise<AgentHubStatus>;
  probeLocal(port?: number): Promise<AgentHubProbe>;
  bootstrapLocal(params: BootstrapLocalParams): Promise<AgentHubBootstrapResult>;
}

export function createHubRuntime(deps: HubRuntimeDeps): HubRuntime {
  const manager = createHubConnectionManager(deps);
  const enroll = (pairingString: string): Promise<AgentHubStatus> =>
    enrollDevice(pairingString, { db: deps.db, dpapi: deps.dpapi, now: deps.now, device: deps.device, manager, createTransport: deps.createTransport });
  return {
    manager,
    enroll,
    bootstrapLocal: (params) => bootstrapLocalHub(params, {
      now: deps.now, localAppData: deps.localAppData, createTransport: deps.createTransport, enroll,
      ownerSignIn: (password) => manager.owner.signIn(password), status: () => manager.status(),
    }),
    probeLocal: (port) => probeLocalHub(port),
  };
}
