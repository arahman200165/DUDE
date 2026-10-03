import { randomBytes } from 'node:crypto';
import { HubApiError, HubProtocolError } from '@dude/api-client';
import type { AgentHubStatus, AgentSyncStatus, FirstSyncChoice, FirstSyncPreview, QuarantinedOpExport, QuarantinedOpView, SyncConflictView } from '@dude/contracts';
import { SYNC_CURSOR_EXPIRED, hubSupportsSync } from '@dude/contracts/hub';
import type { ConfirmPreview, SyncChangesResponse, SyncPushResponse, SyncRecord, SyncSnapshotResponse } from '@dude/contracts/hub';
import { SYNC_LIMITS, categoryOf } from '@dude/sync';
import type { SyncCategory, SyncPhase } from '@dude/sync';
import type { Db } from '@dude/sqlite-store';
import { getMeta, setMeta, transaction } from '@dude/sqlite-store';
import type { CommitContext } from '../store/entity-commit.js';
import { workingEnvironmentId } from '../store/environment.js';
import { setStatusAll } from '../store/repos/outbox.repo.js';
import { getSyncState, updateSyncState } from '../store/repos/sync-state.repo.js';
import { HubManagerError } from '../hub/errors.js';
import type { HubConnectionManager } from '../hub/hub-client.js';
import { applyRemoteChanges } from './apply-remote.js';
import type { AppliedChange, SyncApplyContext } from './apply-remote.js';
import { resolveConflict as resolveConflictRow, listConflictViews } from './conflicts.js';
import type { ConflictChoice } from './conflicts.js';
import { applyPushResults, buildPushBatch } from './push-results.js';
import { discardQuarantined, exportQuarantined, retryQuarantined } from './quarantine.js';
import { applySnapshotPage, beginSnapshot, finishSnapshot } from './rebase.js';
import { computeSyncStatus } from './status.js';
import { FirstSyncError, firstSyncApply, firstSyncPreview } from './first-sync.js';
import type { HubSnapshot } from './first-sync.js';

/** The slice of the Hub connection manager the runtime needs (a fake in unit tests). */
export type SyncManagerPort = Pick<HubConnectionManager, 'status' | 'onChange' | 'deviceCall' | 'hubProtocol' | 'onChangesAvailable'>;

export interface SyncIntervals {
  /** Wait after a local commit before pushing, so a burst of edits is one push. */
  debounceMs: number;
  /** Safety-net poll when no nudge arrived. */
  pollMs: number;
  /** First retry delay; doubles per consecutive failure up to `backoffMaxMs`. */
  backoffMinMs: number;
  backoffMaxMs: number;
  /** Unchanged counts are re-reported to the Hub at most this often. */
  reportMinIntervalMs: number;
}

export const DEFAULT_SYNC_INTERVALS: SyncIntervals = {
  debounceMs: 1_000, pollMs: 5 * 60_000, backoffMinMs: 2_000, backoffMaxMs: 5 * 60_000, reportMinIntervalMs: 30_000,
};

export interface SyncRuntimeDeps {
  db: Db;
  manager: SyncManagerPort;
  now: () => Date;
  newOpId: () => string;
  intervals?: Partial<SyncIntervals>;
  logger?: (message: string, detail?: unknown) => void;
  /** Per-entity-type codec contexts handed to conflict-resolution commits. */
  codecCtx?: Readonly<Record<string, unknown>>;
  /** Test seam for discard confirmation tokens. */
  newToken?: () => string;
  /** Where the first sync keeps its recovery snapshot (`<store dir>/backups`); `use-hub` is refused without it. */
  backupDir?: string;
  /** Test seam: runs after each first-sync category committed (throw to simulate a crash). */
  afterFirstSyncCategory?: (category: SyncCategory) => void;
}

export class SyncRuntimeError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

export interface SyncRuntime {
  start(): void;
  stop(): void;
  status(): AgentSyncStatus;
  onStatus(listener: (status: AgentSyncStatus) => void): () => void;
  onApplied(listener: (changes: AppliedChange[]) => void): () => void;
  /** Runs a cycle as soon as possible (overriding any backoff) and resolves with the status once it ended (or was skipped). */
  syncNow(): Promise<AgentSyncStatus>;
  /** Call after any local commit; schedules a debounced push when something is waiting to send. */
  notifyLocalCommit(): void;
  setCategories(categories: Partial<Record<SyncCategory, boolean>>): AgentSyncStatus;
  setPaused(paused: boolean): AgentSyncStatus;
  /** Step one of the first sync: reads the whole Hub snapshot and compares it with this device. Writes nothing. */
  firstSyncPreview(): Promise<FirstSyncPreview>;
  /** Step two: runs the first sync (resumably) and lets normal sync take over. `use-hub` needs the preview's token. */
  firstSyncApply(params: { choices: Partial<Record<SyncCategory, FirstSyncChoice>>; digest: string; confirmToken?: string }): Promise<AgentSyncStatus>;
  /** The first sync completed. Pushing and pulling start from here. */
  markFirstSyncDone(): void;
  /** The store was wiped (reset): drop in-memory bookkeeping and re-publish the status. */
  afterReset(): void;
  listConflicts(): SyncConflictView[];
  resolveConflict(id: number, choice: ConflictChoice): { ok: true; changes: AppliedChange[] } | { ok: false; error: string };
  listQuarantined(): QuarantinedOpView[];
  exportQuarantined(): QuarantinedOpExport[];
  retryQuarantined(opIds?: readonly string[]): number;
  discardPreview(opId: string): ConfirmPreview;
  discard(opId: string, confirmToken: string): void;
}

type FailureKind = 'network' | 'error' | 'fatal';
interface Failure { kind: FailureKind; message: string }

const REBASE_META = 'sync_rebase_pending';
const MAX_PUSH_BATCHES_PER_CYCLE = 50;
const DISCARD_TOKEN_TTL_MS = 5 * 60_000;
const FIRST_SYNC_TTL_MS = 10 * 60_000;

function classify(error: unknown): Failure {
  if (error instanceof HubManagerError) {
    if (error.code === 'hub-unreachable') return { kind: 'network', message: error.message };
    if (error.code === 'enrollment-revoked' || error.code === 'not-enrolled' || error.code === 'tls-untrusted') return { kind: 'fatal', message: error.message };
    return { kind: 'error', message: error.message };
  }
  if (error instanceof HubApiError) return { kind: 'error', message: `The Hub answered ${error.status} (${error.code}).` };
  if (error instanceof HubProtocolError) return { kind: 'error', message: 'The Hub answered with an unexpected response.' };
  return { kind: 'error', message: error instanceof Error ? error.message : 'Sync failed.' };
}

const isCursorExpired = (error: unknown): boolean => error instanceof HubApiError && error.status === 410 && error.code === SYNC_CURSOR_EXPIRED;

/**
 * Drives synchronization with the Hub for one open store: a single-flight cycle (push batches until empty, then pull
 * changes pages, falling back to a snapshot rebase when the cursor expired) plus the triggers, retry policy and
 * status/applied events around it. Nothing runs before the first sync is done (M656) or while paused, offline,
 * revoked, standalone or against a Hub that does not speak sync.
 *
 * Deferred records (written by a newer schema than this build understands) are NOT applied but the cursor still
 * advances past them; the runtime reports `lastError: 'needs-update'` while any were seen since it started. They are
 * re-fetched by the next snapshot rebase (for example after enabling a category), not automatically after an update.
 */
export function createSyncRuntime(deps: SyncRuntimeDeps): SyncRuntime {
  const { db, manager } = deps;
  const intervals: SyncIntervals = { ...DEFAULT_SYNC_INTERVALS, ...deps.intervals };
  const log = deps.logger ?? ((): void => undefined);
  const statusListeners = new Set<(status: AgentSyncStatus) => void>();
  const appliedListeners = new Set<(changes: AppliedChange[]) => void>();

  let started = false;
  let running = false;
  let rerun = false;
  let timer: NodeJS.Timeout | null = null;
  let timerDue = 0;
  let pollTimer: NodeJS.Timeout | null = null;
  let unsubscribers: Array<() => void> = [];
  let waiters: Array<() => void> = [];
  let failure: Failure | null = null;
  let failures = 0;
  let backoffUntil = 0;
  let headRevision: number | null = null;
  let deferredSeen = 0;
  let lastHubState: AgentHubStatus['state'] | null = null;
  let lastEmitted = '';
  let lastReport: { key: string; at: number } | null = null;
  const tokens = new Map<string, { opId: string; expiresAt: number }>();
  const firstSyncTokens = new Map<string, { digest: string; expiresAt: number }>();
  let firstSyncCache: { digest: string; snapshot: HubSnapshot; expiresAt: number } | null = null;

  // --- State ------------------------------------------------------------------------------------------------------------

  const environmentId = (): string => workingEnvironmentId(db);
  const applyCtx = (): SyncApplyContext => ({ environmentId: environmentId(), now: deps.now, newOpId: deps.newOpId });
  const commitCtx = (): CommitContext => ({
    deviceId: getMeta(db, 'device_id') ?? '', environmentId: environmentId(), now: deps.now, newOpId: deps.newOpId, codecCtx: deps.codecCtx,
  });

  /** The phase that stops a cycle from running, or null when sync may run. */
  function blockedPhase(): SyncPhase | null {
    const hub = manager.status();
    if (!hub.enrollment || hub.state === 'standalone') return 'standalone';
    if (hub.state === 'revoked' || hub.enrollment.state === 'revoked') return 'revoked';
    if (hub.state === 'incompatible' || hub.state === 'untrusted-tls') return 'error';
    const protocol = manager.hubProtocol();
    if (protocol !== null && !hubSupportsSync(protocol)) return 'hub-outdated';
    const state = getSyncState(db);
    if (state.paused) return 'paused';
    if (hub.state !== 'online') return 'offline';
    if (state.firstSyncState !== 'done') return 'needs-first-sync';
    return null;
  }

  function currentPhase(): SyncPhase {
    const blocked = blockedPhase();
    if (blocked !== null) return blocked;
    if (running) return 'syncing';
    if (failure !== null) return failure.kind === 'network' ? 'offline' : 'error';
    return 'idle';
  }

  function liveError(phase: SyncPhase): string | null {
    if (failure !== null && phase !== 'standalone') return failure.message;
    const hub = manager.status();
    if ((phase === 'error' || phase === 'offline' || phase === 'revoked') && hub.lastError) return hub.lastError;
    if (phase === 'hub-outdated') return 'The Hub is too old to sync. Update the Hub.';
    if (deferredSeen > 0) return 'needs-update';
    return null;
  }

  function status(): AgentSyncStatus {
    const phase = currentPhase();
    return computeSyncStatus(db, { phase, lastError: liveError(phase), headRevision });
  }

  function emitStatus(): void {
    if (!started) return;
    const next = status();
    const key = JSON.stringify(next);
    if (key === lastEmitted) return;
    lastEmitted = key;
    for (const listener of [...statusListeners]) { try { listener(next); } catch { /* a listener must not break sync */ } }
  }

  function emitApplied(changes: readonly AppliedChange[]): void {
    if (changes.length === 0) return;
    const copy = [...changes];
    for (const listener of [...appliedListeners]) { try { listener(copy); } catch { /* a listener must not break sync */ } }
  }

  // --- Cycle ------------------------------------------------------------------------------------------------------------

  const call = <T>(fn: Parameters<SyncManagerPort['deviceCall']>[0]): Promise<T> => manager.deviceCall(fn) as Promise<T>;
  const enabled = (category: SyncCategory | undefined, categories: Record<SyncCategory, boolean>): boolean => category === undefined || categories[category];
  const stillActive = (): boolean => started && blockedPhase() === null;

  async function pushPhase(ctx: SyncApplyContext): Promise<void> {
    for (let i = 0; i < MAX_PUSH_BATCHES_PER_CYCLE && stillActive(); i++) {
      const state = getSyncState(db);
      const batch = buildPushBatch(db, state.categories, state.firstSyncState === 'done', deps.now);
      if (batch.ops.length === 0) {
        if (batch.quarantined > 0) { emitStatus(); continue; }
        return;
      }
      const response = await call<SyncPushResponse>((api, token) => api.syncPush(token, batch.ops));
      headRevision = response.headRevision;
      const outcome = applyPushResults(db, batch.sent, response.results, ctx);
      emitApplied(outcome.applied);
      emitStatus();
      if (response.results.length === 0) return;
    }
  }

  function pullRecords(records: readonly SyncRecord[]): SyncRecord[] {
    const categories = getSyncState(db).categories;
    return records.filter((r) => enabled(categoryOf(r.entityType), categories));
  }

  async function rebase(ctx: SyncApplyContext): Promise<void> {
    const collector = beginSnapshot();
    let asOf: number | null = null;
    let floor = 0;
    let after: { afterType: string; afterId: string } | undefined;
    do {
      const page = await call<SyncSnapshotResponse>((api, token) => api.syncSnapshot(token, { ...after, limit: SYNC_LIMITS.snapshotPage }));
      asOf ??= page.asOfRevision;
      floor = page.floor;
      headRevision = Math.max(headRevision ?? 0, page.asOfRevision);
      applySnapshotPage(db, collector, pullRecords(page.records), ctx);
      after = page.next ?? undefined;
    } while (after);
    const result = transaction(db, () => {
      const categories = getSyncState(db).categories;
      const outcome = finishSnapshot(db, collector, ctx, (type) => enabled(categoryOf(type), categories));
      updateSyncState(db, { cursor: asOf ?? 0, floor });
      db.prepare('DELETE FROM meta WHERE key = ?').run(REBASE_META);
      return outcome;
    });
    deferredSeen += result.deferred.length;
    emitApplied(result.applied);
    log('sync: snapshot rebase finished', { applied: result.applied.length, deletedLocally: result.deletedLocally, conflicts: result.conflicts });
  }

  async function pullPhase(ctx: SyncApplyContext): Promise<void> {
    let rebased = false;
    if (getMeta(db, REBASE_META) !== undefined) { await rebase(ctx); rebased = true; }
    for (;;) {
      if (!stillActive()) return;
      const before = getSyncState(db).cursor;
      let page: SyncChangesResponse;
      try {
        page = await call<SyncChangesResponse>((api, token) => api.syncChanges(token, before, SYNC_LIMITS.changesPage));
      } catch (error) {
        if (isCursorExpired(error) && !rebased) { await rebase(ctx); rebased = true; continue; }
        throw error;
      }
      headRevision = page.headRevision;
      // The cursor moves in the same transaction as the apply, so a crash replays the page idempotently.
      const result = transaction(db, () => {
        const applied = applyRemoteChanges(db, pullRecords(page.changes), ctx);
        updateSyncState(db, { cursor: Math.max(before, page.cursor), floor: page.floor });
        return applied;
      });
      deferredSeen += result.deferred.length;
      emitApplied(result.applied);
      emitStatus();
      if (!page.hasMore) return;
      if (page.cursor <= before) throw new Error('The Hub did not advance the change cursor.');
    }
  }

  async function fetchHubSnapshot(): Promise<HubSnapshot> {
    const records: SyncRecord[] = [];
    let asOf: number | null = null;
    let floor = 0;
    let after: { afterType: string; afterId: string } | undefined;
    do {
      const page = await call<SyncSnapshotResponse>((api, token) => api.syncSnapshot(token, { ...after, limit: SYNC_LIMITS.snapshotPage }));
      asOf ??= page.asOfRevision;
      floor = page.floor;
      records.push(...page.records);
      after = page.next ?? undefined;
    } while (after);
    return { asOfRevision: asOf ?? 0, floor, records };
  }

  const asRuntimeError = (error: unknown): unknown => (error instanceof FirstSyncError ? new SyncRuntimeError(error.code, error.message) : error);

  async function reportState(): Promise<void> {
    const current = computeSyncStatus(db, { phase: 'idle', lastError: null, headRevision });
    const key = JSON.stringify([current.cursor, current.pending, current.quarantined, current.conflicts, current.stranded, current.categories]);
    const nowMs = Date.now();
    if (lastReport && lastReport.key === key && nowMs - lastReport.at < intervals.reportMinIntervalMs) return;
    try {
      const response = await call<{ headRevision: number }>((api, token) => api.syncReportState(token, {
        cursor: current.cursor, pending: current.pending, quarantined: current.quarantined, conflicts: current.conflicts, stranded: current.stranded,
        categories: current.categories, lastSyncAt: current.lastSyncAt,
      }));
      headRevision = response.headRevision;
      lastReport = { key, at: nowMs };
    } catch (error) {
      // Reporting is best effort; the next cycle retries it.
      log('sync: state report failed', classify(error).message);
    }
  }

  async function cycle(): Promise<void> {
    const ctx = applyCtx();
    await pushPhase(ctx);
    await pullPhase(ctx);
    const state = getSyncState(db);
    const lastError = deferredSeen > 0 ? 'needs-update' : null;
    updateSyncState(db, { lastSyncAt: deps.now().toISOString(), ...(state.lastError === lastError ? {} : { lastError }) });
    await reportState();
  }

  // --- Scheduling -------------------------------------------------------------------------------------------------------

  function schedule(delayMs: number): void {
    if (!started) return;
    const due = Date.now() + delayMs;
    if (timer && timerDue <= due) return;
    if (timer) clearTimeout(timer);
    timerDue = due;
    timer = setTimeout(() => { timer = null; void run(); }, delayMs);
    timer.unref();
  }

  /** Requests a cycle. Unless `force`, a pending retry backoff is respected. */
  function trigger(delayMs: number, force = false): void {
    if (!started) return;
    if (running) { rerun = true; return; }
    if (!force && Date.now() < backoffUntil) return;
    if (force) backoffUntil = 0;
    schedule(delayMs);
  }

  async function run(): Promise<void> {
    if (!started) return;
    if (running) { rerun = true; return; }
    const mine = waiters;
    waiters = [];
    if (blockedPhase() !== null) {
      for (const done of mine) done();
      emitStatus();
      return;
    }
    running = true;
    rerun = false;
    let retryIn: number | null = null;
    emitStatus();
    try {
      await cycle();
      failure = null;
      failures = 0;
      backoffUntil = 0;
    } catch (error) {
      const found = classify(error);
      failure = found;
      log('sync: cycle failed', { kind: found.kind, message: found.message });
      if (found.kind !== 'fatal') {
        failures += 1;
        retryIn = Math.min(intervals.backoffMaxMs, intervals.backoffMinMs * 2 ** (failures - 1));
        backoffUntil = Date.now() + retryIn;
      }
    } finally {
      running = false;
      for (const done of mine) done();
      emitStatus();
    }
    if (waiters.length > 0 || (rerun && retryIn === null)) trigger(0, true);
    else if (retryIn !== null) schedule(retryIn);
  }

  // --- Reactions --------------------------------------------------------------------------------------------------------

  function onHubChange(hub: AgentHubStatus): void {
    if (hub.state === 'revoked') {
      // Nothing more can be sent from this enrollment: pending work is stranded until the device is paired again.
      if (setStatusAll(db, ['pending'], 'stranded') > 0) log('sync: pending ops stranded by revocation');
    }
    const cameOnline = hub.state === 'online' && lastHubState !== 'online';
    lastHubState = hub.state;
    if (cameOnline) { failures = 0; trigger(0, true); }
    emitStatus();
  }

  return {
    start() {
      if (started) return;
      started = true;
      lastHubState = manager.status().state;
      unsubscribers = [
        manager.onChange(onHubChange),
        manager.onChangesAvailable(() => trigger(0)),
      ];
      pollTimer = setInterval(() => trigger(0), intervals.pollMs);
      pollTimer.unref();
      if (lastHubState === 'revoked') setStatusAll(db, ['pending'], 'stranded');
      if (lastHubState === 'online') trigger(0, true);
      emitStatus();
    },
    stop() {
      started = false;
      if (timer) { clearTimeout(timer); timer = null; }
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      for (const off of unsubscribers) off();
      unsubscribers = [];
      const pending = waiters;
      waiters = [];
      for (const done of pending) done();
      tokens.clear();
      firstSyncTokens.clear();
      firstSyncCache = null;
    },
    status,
    onStatus(listener) { statusListeners.add(listener); return () => { statusListeners.delete(listener); }; },
    onApplied(listener) { appliedListeners.add(listener); return () => { appliedListeners.delete(listener); }; },
    syncNow() {
      if (!started) return Promise.resolve(status());
      return new Promise<AgentSyncStatus>((resolve) => {
        waiters.push(() => resolve(status()));
        if (running) rerun = true;
        else { backoffUntil = 0; schedule(0); }
      });
    },
    notifyLocalCommit() {
      if (!started) return;
      emitStatus();
      if (status().pending > 0) trigger(intervals.debounceMs);
    },
    setCategories(categories) {
      const before = getSyncState(db);
      const next = updateSyncState(db, { categories });
      // Records of a category that was off were skipped on pull; a snapshot rebase brings them (and their deletions) in.
      const reenabled = Object.keys(categories).some((id) => !before.categories[id as SyncCategory] && next.categories[id as SyncCategory]);
      if (reenabled && before.firstSyncState === 'done') setMeta(db, REBASE_META, '1');
      emitStatus();
      trigger(0, true);
      return status();
    },
    setPaused(paused) {
      updateSyncState(db, { paused });
      emitStatus();
      if (!paused) trigger(0, true);
      return status();
    },
    async firstSyncPreview() {
      try {
        const snapshot = await fetchHubSnapshot();
        const { preview, needsConfirmation } = firstSyncPreview(db, snapshot);
        const expiresAt = deps.now().getTime() + FIRST_SYNC_TTL_MS;
        firstSyncCache = { digest: preview.digest, snapshot, expiresAt };
        firstSyncTokens.clear();
        if (!needsConfirmation) return preview;
        const confirmToken = (deps.newToken ?? ((): string => randomBytes(24).toString('base64url')))();
        firstSyncTokens.set(confirmToken, { digest: preview.digest, expiresAt });
        return { ...preview, confirmToken, expiresAt: new Date(expiresAt).toISOString() };
      } catch (error) { throw asRuntimeError(error); }
    },
    async firstSyncApply(params) {
      try {
        const now = deps.now().getTime();
        let confirmed = false;
        if (params.confirmToken !== undefined) {
          const held = firstSyncTokens.get(params.confirmToken);
          firstSyncTokens.delete(params.confirmToken);
          if (!held || held.digest !== params.digest || held.expiresAt < now) throw new SyncRuntimeError('invalid-token', 'The confirmation expired. Preview the first sync again.');
          confirmed = true;
        }
        const cached = firstSyncCache !== null && firstSyncCache.digest === params.digest && firstSyncCache.expiresAt >= now ? firstSyncCache : null;
        const snapshot = cached?.snapshot ?? await fetchHubSnapshot();
        const result = firstSyncApply(db, { choices: params.choices, digest: params.digest }, snapshot, {
          now: deps.now, newOpId: deps.newOpId, deviceId: getMeta(db, 'device_id') ?? '', backupDir: deps.backupDir, confirmed, afterCategory: deps.afterFirstSyncCategory,
        });
        firstSyncCache = null;
        firstSyncTokens.clear();
        headRevision = Math.max(headRevision ?? 0, snapshot.asOfRevision);
        emitApplied(result.applied);
        log('sync: first sync applied', { applied: result.applied.length, conflicts: result.conflicts, recoverySnapshot: result.recoverySnapshot });
        this.markFirstSyncDone();
        return status();
      } catch (error) { throw asRuntimeError(error); }
    },
    markFirstSyncDone() {
      updateSyncState(db, { firstSyncState: 'done', firstSyncAt: deps.now().toISOString() });
      db.prepare('DELETE FROM meta WHERE key = ?').run(REBASE_META);
      emitStatus();
      trigger(0, true);
    },
    afterReset() {
      failure = null;
      failures = 0;
      backoffUntil = 0;
      headRevision = null;
      deferredSeen = 0;
      lastReport = null;
      tokens.clear();
      firstSyncTokens.clear();
      firstSyncCache = null;
      emitStatus();
    },
    listConflicts() {
      return listConflictViews(db).map((c) => ({
        id: c.id, entityType: c.entityType, entityId: c.entityId, kind: c.kind, category: c.category ?? null, name: c.name,
        localPayload: c.localPayload, localDeleted: c.localDeleted, basePayload: c.basePayload, remotePayload: c.remotePayload,
        remoteDeleted: c.remoteDeleted, remoteRevision: c.remoteRevision, fields: c.fields, detectedAt: c.detectedAt, canKeepBoth: c.canKeepBoth,
      }));
    },
    resolveConflict(id, choice) {
      const result = resolveConflictRow(db, id, choice, commitCtx());
      if (result.ok) {
        emitApplied(result.changes);
        emitStatus();
        trigger(intervals.debounceMs);
      }
      return result;
    },
    listQuarantined() {
      return exportQuarantined(db).map(({ schemaVersion: _s, basedOnRevision: _b, payload: _p, ...view }) => ({
        ...view, opKind: view.opKind as 'upsert' | 'delete', category: categoryOf(view.entityType) ?? null,
      }));
    },
    exportQuarantined() {
      return exportQuarantined(db).map((op) => ({ ...op, opKind: op.opKind as 'upsert' | 'delete', category: categoryOf(op.entityType) ?? null }));
    },
    retryQuarantined(opIds) {
      const moved = retryQuarantined(db, opIds);
      if (moved > 0) { emitStatus(); trigger(0, true); }
      return moved;
    },
    discardPreview(opId) {
      const op = exportQuarantined(db).find((o) => o.opId === opId);
      if (!op) throw new SyncRuntimeError('not-quarantined', 'That change is not in quarantine.');
      const confirmToken = (deps.newToken ?? ((): string => randomBytes(24).toString('base64url')))();
      const expiresAt = deps.now().getTime() + DISCARD_TOKEN_TTL_MS;
      tokens.set(confirmToken, { opId, expiresAt });
      return {
        confirmToken, expiresAt: new Date(expiresAt).toISOString(),
        summary: { action: 'discard-quarantined-op', displayName: `${op.entityType} ${op.entityId}`, entityType: op.entityType, entityId: op.entityId, reason: op.reason },
      };
    },
    discard(opId, confirmToken) {
      const held = tokens.get(confirmToken);
      tokens.delete(confirmToken);
      if (!held || held.opId !== opId || held.expiresAt < deps.now().getTime()) throw new SyncRuntimeError('invalid-token', 'The confirmation expired. Preview the discard again.');
      if (!discardQuarantined(db, opId)) throw new SyncRuntimeError('not-quarantined', 'That change is not in quarantine.');
      emitStatus();
    },
  };
}
