import type { AgentDiagnostics, AgentSyncStatus, AgentHubBootstrapResult, AgentHubProbe, AgentHubStatus } from '@dude/contracts';
import type { Db } from '@dude/sqlite-store';
import type { DpapiPort } from '../native/windows-sys-client.js';
import { bootstrapLocalHub } from './bootstrap-local.js';
import type { BootstrapLocalDeps, BootstrapLocalParams } from './bootstrap-local.js';
import { enrollDevice, reconnectDevice } from './enroll.js';
import { createHubConnectionManager } from './hub-client.js';
import type { HubConnectionManager, HubManagerDeps } from './hub-client.js';
import { probeLocalHub } from './probe.js';
import { buildAgentDiagnostics } from './agent-diagnostics.js';
import { getEnrollment } from '../store/repos/hub-enrollment.repo.js';

export interface HubRuntimeDeps extends Pick<HubManagerDeps, 'now' | 'device' | 'timings' | 'random' | 'createTransport'> {
  db: Db;
  dpapi: DpapiPort;
  /** Test seam: where the hand-off file lives (default `%LOCALAPPDATA%`). */
  localAppData?: BootstrapLocalDeps['localAppData'];
  /** Where `reconnect` keeps its `reconnect-<ts>.db` recovery snapshot; without it none is taken. */
  backupDir?: string;
}

/** Everything the RPC layer needs for the Hub: the connection manager plus pairing and local discovery. */
export interface HubRuntime {
  manager: HubConnectionManager;
  enroll(pairingString: string): Promise<AgentHubStatus>;
  /** Re-pairs an enrolled device whose Hub changed, keeping its data and outbox (PD-073). The caller has already collected the acknowledgement. */
  reconnect(pairingString: string): Promise<AgentHubStatus>;
  probeLocal(port?: number): Promise<AgentHubProbe>;
  bootstrapLocal(params: BootstrapLocalParams): Promise<AgentHubBootstrapResult>;
  /** Device-side report: one pinned public hello plus tracked enrollment and sync state. */
  diagnostics(sync: AgentSyncStatus | null): Promise<AgentDiagnostics>;
}

export function createHubRuntime(deps: HubRuntimeDeps): HubRuntime {
  const manager = createHubConnectionManager(deps);
  const enroll = (pairingString: string): Promise<AgentHubStatus> =>
    enrollDevice(pairingString, { db: deps.db, dpapi: deps.dpapi, now: deps.now, device: deps.device, manager, createTransport: deps.createTransport });
  const reconnect = (pairingString: string): Promise<AgentHubStatus> =>
    reconnectDevice(pairingString, { db: deps.db, dpapi: deps.dpapi, now: deps.now, device: deps.device, manager, createTransport: deps.createTransport, backupDir: deps.backupDir });
  return {
    manager,
    enroll,
    reconnect,
    bootstrapLocal: (params) => bootstrapLocalHub(params, {
      now: deps.now, localAppData: deps.localAppData, createTransport: deps.createTransport, enroll,
      ownerSignIn: (password) => manager.owner.signIn(password), status: () => manager.status(),
    }),
    probeLocal: (port) => probeLocalHub(port),
    diagnostics: (sync) => buildAgentDiagnostics({ enrollment: getEnrollment(deps.db), status: manager.status(), sync, now: deps.now, createTransport: deps.createTransport }),
  };
}
