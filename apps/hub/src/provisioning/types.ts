import type { HubPowerStatus, HubProvisioningComponentId, HubProvisioningComponentState, HubTunnelStatusResponse } from '@dude/contracts/hub';
import type { Db } from '@dude/sqlite-store';
import type { HubPaths } from '../config/data-dir.js';
import type { SqliteVecState } from '../db/sqlite-vec.js';
import type { OidcStatus } from '../auth/oidc/client.js';

/** Longest `detail` and `nextAction` the engine will keep (the contract limits are 240 and 200). */
export const DETAIL_MAX = 200;
export const ACTION_MAX = 180;

/** The copyable commands every report carries (the elevated terminal on the Hub machine). */
export const PROVISIONING_COMMANDS = ['dude-hub provision', 'dude-hub provision status'] as const;

/** One purpose's presence, never a value. Only the `secrets` component reports it. */
export interface SecretPresence {
  purpose: string;
  present: boolean;
  needsReentry: boolean;
}

/** What a component's `check` returns. `detail` is one short sentence: no secret, no absolute path. */
export interface ComponentOutcome {
  state: HubProvisioningComponentState;
  detail: string;
  nextAction?: string;
  /** Set by the `secrets` component only; the engine lifts it into `report.secrets` and derives `needs-provisioning` from it. */
  secrets?: readonly SecretPresence[];
}

/** The state of `data/savesphere.db` as the engine found or opened it. The connection is the engine's: a component never closes it. */
export type StoreHandle =
  | { state: 'absent' }
  | { state: 'ready'; db: Db; schemaVersion: number; createdNow: boolean }
  | { state: 'incompatible' | 'corrupt' };

/** Environment probes, injectable so specs never spawn a process or load a library. */
export interface ProvisioningProbes {
  sqliteVec(): SqliteVecState;
  /** Resolves with a short note, rejects when FTS5 is unavailable. */
  fts5(): string | Promise<string>;
  /** Re-spawns the Hub in worker mode and exchanges one message; resolves with how it ran. */
  workerPing(): Promise<string>;
  /** Free bytes on the volume holding `dir`; null when it cannot be read. */
  freeBytes(dir: string): number | null;
}

export interface ProvisioningContext {
  paths: HubPaths;
  mode: 'provision' | 'check';
  now(): number;
  store: StoreHandle;
  platform: NodeJS.Platform;
  /** The running Hub's identity (the admin and route contexts supply it); a restored data directory carries another one. */
  hubInstanceId?: string;
  /** Whether this process runs the queue runner; undefined when the caller cannot know (the CLI engine, specs). */
  queueRunning?: boolean;
  /** The running Hub's tunnel read model (Milestone 837); undefined when the caller has no tunnel runtime (the CLI engine, specs). */
  tunnel?: () => HubTunnelStatusResponse;
  /** The running Hub's OIDC client status (Milestone 841): offline facts and the last known provider reachability; undefined when the caller has none. */
  oidc?: () => OidcStatus;
  /** The running Hub's last power policy check (Milestone 851); undefined when the caller has none. */
  power?: () => HubPowerStatus | undefined;
  probes: ProvisioningProbes;
}

/**
 * One provisioned component. `provision` is additive and idempotent (it creates what is missing and never removes or rewrites
 * anything the owner holds) and returns the logical names it created (`storage/blobs`, never an absolute path). `check` is read-only
 * and must never throw a secret or a path (the engine redacts and caps whatever it returns and contains a throw).
 */
export interface ProvisioningComponent {
  id: HubProvisioningComponentId;
  /** Components the engine's `needs-provisioning` derivation treats as required storage: a `not-configured` one means "run provision". */
  core?: boolean;
  provision?(context: ProvisioningContext): void | readonly string[] | Promise<void | readonly string[]>;
  check(context: ProvisioningContext): ComponentOutcome | Promise<ComponentOutcome>;
}
