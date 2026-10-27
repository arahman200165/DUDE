import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { transaction } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import type { HubProvisioningComponent, HubProvisioningResponse } from '@dude/contracts/hub';
import { ensureLayout } from '../config/data-dir.js';
import type { HubPaths } from '../config/data-dir.js';
import { redactJobError } from '../queue/redact.js';
import { appendAuditOutbox } from '../savesphere-db/audit-outbox.js';
import { openSaveSphereDb } from '../savesphere-db/open.js';
import { defaultProbes } from './probes.js';
import { listProvisioningComponents } from './registry.js';
import { deriveOverall, readLastRun, writeLastRun } from './state.js';
import type { LastRun } from './state.js';
import './components/index.js';
import { ACTION_MAX, DETAIL_MAX, PROVISIONING_COMMANDS } from './types.js';
import type { ComponentOutcome, ProvisioningComponent, ProvisioningContext, ProvisioningProbes, SecretPresence, StoreHandle } from './types.js';

export interface ProvisioningOptions {
  /** The running Hub's identity; recorded by a run and compared by the `needs-provisioning` derivation. */
  hubInstanceId?: string;
  /** Whether this process runs the queue runner (only the Hub process knows). */
  queueRunning?: boolean;
  now?: () => number;
  platform?: NodeJS.Platform;
  /** Replaces the registry (specs). */
  components?: readonly ProvisioningComponent[];
  probes?: Partial<ProvisioningProbes>;
  /** Hands pending `audit_outbox` rows to `dude.db`'s audit log; called after the run's commit. Without it the rows wait for the next drain. */
  drainAudit?: (store: Db) => void;
}

/** The result of one provisioning run. `created` are logical names (`storage/blobs`), never absolute paths. */
export interface ProvisioningRun {
  report: HubProvisioningResponse;
  created: string[];
  /** True when this run created the content store inside a Hub process that started without one: the queue runner starts at the next start. */
  restartRequired: boolean;
  /** Components whose `provision` step threw (their ids only). */
  failed: string[];
}

const clip = (text: string, max: number): string => (text.length <= max ? text : `${text.slice(0, max - 3)}...`);
const sentence = (text: string, max: number): string => clip(redactJobError(text), max);

function buildContext(paths: HubPaths, mode: ProvisioningContext['mode'], store: StoreHandle, options: ProvisioningOptions): ProvisioningContext {
  return {
    paths, mode, store,
    now: options.now ?? Date.now,
    platform: options.platform ?? process.platform,
    probes: defaultProbes(options.probes),
    ...(options.hubInstanceId !== undefined ? { hubInstanceId: options.hubInstanceId } : {}),
    ...(options.queueRunning !== undefined ? { queueRunning: options.queueRunning } : {}),
  };
}

/** Opens the store the way the run asked: creating it (provision) or only when it exists (check). Its connection is closed by the caller. */
function openStore(paths: HubPaths, create: boolean): { handle: StoreHandle; close: () => void } {
  const existed = existsSync(paths.saveSphereDbPath);
  if (!existed && !create) return { handle: { state: 'absent' }, close: () => undefined };
  const opened = openSaveSphereDb(paths);
  if (opened.status !== 'ready') return { handle: { state: opened.status }, close: () => undefined };
  const row = opened.store.db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number | bigint | null } | undefined;
  return { handle: { state: 'ready', db: opened.store.db, schemaVersion: Number(row?.v ?? 0), createdNow: !existed }, close: () => opened.store.close() };
}

async function checkOne(component: ProvisioningComponent, context: ProvisioningContext): Promise<ComponentOutcome> {
  try {
    return await component.check(context);
  } catch (error) {
    return {
      state: 'degraded',
      detail: `The check did not complete: ${sentence(error instanceof Error ? error.message : 'unknown error', 120)}`,
      nextAction: 'Run "dude-hub provision status" again; if it keeps failing, check the Hub log.',
    };
  }
}

/** Runs every component's `check` and assembles the report. Read-only. `recorded` is a run the caller is about to commit. */
async function buildReport(context: ProvisioningContext, components: readonly ProvisioningComponent[], recorded?: LastRun): Promise<HubProvisioningResponse> {
  const at = new Date(context.now()).toISOString();
  const rows: HubProvisioningComponent[] = [];
  const secrets: SecretPresence[] = [];
  const derive: Array<{ state: ComponentOutcome['state']; core: boolean }> = [];
  for (const component of components) {
    const outcome = await checkOne(component, context);
    rows.push({
      id: component.id, state: outcome.state, detail: sentence(outcome.detail, DETAIL_MAX), checkedAt: at,
      ...(outcome.nextAction !== undefined ? { nextAction: sentence(outcome.nextAction, ACTION_MAX) } : {}),
    });
    derive.push({ state: outcome.state, core: component.core === true });
    if (outcome.secrets !== undefined) secrets.push(...outcome.secrets);
  }
  const lastRun = recorded ?? (context.store.state === 'ready' ? readLastRun(context.store.db) : null);
  return {
    overall: deriveOverall({ storeState: context.store.state, lastRun, hubInstanceId: context.hubInstanceId, components: derive, secrets }),
    checkedAt: at,
    lastRun: lastRun === null ? null : { at: lastRun.at, outcome: lastRun.outcome },
    components: rows,
    secrets,
    commands: [...PROVISIONING_COMMANDS],
  };
}

/**
 * Read-only status: opens `savesphere.db` only when it exists (a check never creates it), asks every registered component for its
 * state and derives the overall picture. Safe to run at Hub start and from the status route.
 */
export async function checkProvisioning(paths: HubPaths, options: ProvisioningOptions = {}): Promise<HubProvisioningResponse> {
  const store = openStore(paths, false);
  try {
    return await buildReport(buildContext(paths, 'check', store.handle, options), options.components ?? listProvisioningComponents());
  } finally {
    store.close();
  }
}

const inflight = new Map<string, Promise<ProvisioningRun>>();

async function runProvisioning(paths: HubPaths, options: ProvisioningOptions): Promise<ProvisioningRun> {
  const components = options.components ?? listProvisioningComponents();
  const now = options.now ?? Date.now;
  ensureLayout(paths.root);
  const store = openStore(paths, true);
  try {
    const context = buildContext(paths, 'provision', store.handle, options);
    const created: string[] = [];
    const failed: string[] = [];
    for (const component of components) {
      if (component.provision === undefined) continue;
      try {
        created.push(...((await component.provision(context)) ?? []));
      } catch {
        failed.push(component.id);
      }
    }
    const recorded: LastRun = {
      at: new Date(now()).toISOString(),
      outcome: failed.length === 0 ? 'ok' : 'attention',
      ...(options.hubInstanceId !== undefined ? { hubInstanceId: options.hubInstanceId } : {}),
    };
    const report = await buildReport(context, components, store.handle.state === 'ready' ? recorded : undefined);
    if (store.handle.state === 'ready') {
      const db = store.handle.db;
      const states: Record<string, number> = {};
      for (const row of report.components) states[row.state] = (states[row.state] ?? 0) + 1;
      // The last-run record and its audit event commit together (PD-146): both persist or neither does.
      transaction(db, () => {
        writeLastRun(db, recorded);
        appendAuditOutbox(db, {
          event: 'provisioning.run', outcome: failed.length === 0 ? 'success' : 'failure', actorKind: 'cli', now: now(),
          dedupeKey: `provisioning.run:${randomUUID()}`,
          detail: { overall: report.overall, created: created.length, failed: failed.length, states },
        });
      });
      try { options.drainAudit?.(db); } catch { /* the rows stay pending and the next drain hands them over */ }
    }
    const restartRequired = store.handle.state === 'ready' && store.handle.createdNow && options.queueRunning === false;
    return { report, created, restartRequired, failed };
  } finally {
    store.close();
  }
}

/**
 * Idempotent, additive provisioning of every registered component (PD-118, PD-153): creates the layout, opens and migrates
 * `savesphere.db`, runs each component's `provision` then its `check`, records the run (with its audit event) in the content store
 * and returns the report. Nothing is removed or rewritten, so no confirmation token is needed; it is still an owner-intent state
 * change, so the run is audited (`provisioning.run`) and only reachable through the elevated admin pipe. Single-flight per Hub data
 * directory: a second call while one runs joins it and gets the same result. A component whose step throws is reported, never fatal.
 */
export function provision(paths: HubPaths, options: ProvisioningOptions = {}): Promise<ProvisioningRun> {
  const running = inflight.get(paths.root);
  if (running !== undefined) return running;
  const run = runProvisioning(paths, options).finally(() => { inflight.delete(paths.root); });
  inflight.set(paths.root, run);
  return run;
}
