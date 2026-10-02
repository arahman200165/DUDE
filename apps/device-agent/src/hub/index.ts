import type { AgentHubProbe, AgentHubStatus } from '@dude/contracts';
import type { Db } from '@dude/sqlite-store';
import type { DpapiPort } from '../native/windows-sys-client.js';
import { enrollDevice } from './enroll.js';
import { createHubConnectionManager } from './hub-client.js';
import type { HubConnectionManager, HubManagerDeps } from './hub-client.js';
import { probeLocalHub } from './probe.js';

export interface HubRuntimeDeps extends Pick<HubManagerDeps, 'now' | 'device' | 'timings' | 'random' | 'createTransport'> {
  db: Db;
  dpapi: DpapiPort;
}

/** Everything the RPC layer needs for the Hub: the connection manager plus pairing and local discovery. */
export interface HubRuntime {
  manager: HubConnectionManager;
  enroll(pairingString: string): Promise<AgentHubStatus>;
  probeLocal(port?: number): Promise<AgentHubProbe>;
}

export function createHubRuntime(deps: HubRuntimeDeps): HubRuntime {
  const manager = createHubConnectionManager(deps);
  return {
    manager,
    enroll: (pairingString) => enrollDevice(pairingString, { db: deps.db, dpapi: deps.dpapi, now: deps.now, device: deps.device, manager, createTransport: deps.createTransport }),
    probeLocal: (port) => probeLocalHub(port),
  };
}
