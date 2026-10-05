import { HubApiError } from '@dude/api-client';
import type { SyncChangesResponse, SyncOp, SyncPushResponse, SyncRecord } from '@dude/contracts/hub';
import { SYNC_CATEGORY_IDS, SYNC_LIMITS, categoryOf } from '@dude/sync';
import { MobileHubRealtime } from '../hub/realtime';
import { MobileDeviceSession } from '../hub/session';
import { MobileHubError } from '../hub/types';
import type { MobileRealtimePort } from '../hub/native';
import type { MobileStore } from '../storage/store';
import type { CategoryFlags, ClaimedOperation, MobileCategory, SnapshotChoice, StorageContext } from '../storage/types';
import type { DestructivePreview, FirstSyncPreview } from '../state/workbench-model';
import { MobileConfirmationBoundary, MOBILE_LIFECYCLE_CONSEQUENCES, type ConfirmationState } from '../lifecycle/confirmation';

export interface SyncDriverState {
  readonly phase: 'paused' | 'syncing' | 'live' | 'needs-consent' | 'offline' | 'error' | 'revoked' | 'incompatible';
  readonly detail: string;
  readonly failure?: 'authority' | 'pin' | 'key' | 'revoked';
  readonly preview?: FirstSyncPreview;
}
interface PreviewBinding {
  readonly stageId: string; readonly context: StorageContext; readonly head: number; readonly epoch: number;
  readonly categories: readonly MobileCategory[]; readonly expires: number;
}
export interface SyncDriverOptions {
  readonly store: MobileStore;
  readonly session: MobileDeviceSession;
  readonly contextId: string;
  readonly realtime?: MobileRealtimePort;
  readonly id: () => string;
  readonly now: () => number;
  readonly onState: (state: SyncDriverState) => void;
}
const CATEGORIES: readonly MobileCategory[] = ['favorites', 'settings'];
// 16 maximum-sized records remain below the native 4 MiB response ceiling.
const READ_PAGE = Math.min(16, SYNC_LIMITS.changesPage, SYNC_LIMITS.snapshotPage);
const MAX_PULL_PAGES = 16;
const selected = (flags: CategoryFlags): MobileCategory[] => CATEGORIES.filter(category => flags[category]);
const keyOf = (record: Pick<SyncRecord, 'entityType' | 'entityId'>): string => `${record.entityType}/${record.entityId}`;
export function utf8Size(value: string): number {
  let size = 0;
  for (const char of value) { const code = char.codePointAt(0)!; size += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4; }
  return size;
}
const wireOperation = (op: ClaimedOperation): SyncOp => ({
  opId: op.opId, entityType: op.entityType, entityId: op.entityId, opKind: op.opKind,
  schemaVersion: op.schemaVersion, basedOnRevision: op.basedOnRevision, payload: op.payload,
});
class Suspended extends Error {}
class ReconcileRequired extends Error {}

/** Android foreground-only sync; claimed operation identities survive every ambiguous transport outcome. */
export class MobileSyncDriver {
  private foreground = false;
  private appActive = false;
  private closed = false;
  private generation = 0;
  private flight: Promise<void> | null = null;
  private requested = false;
  private blocked = false;
  private retries = 0;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private realtime: MobileHubRealtime | null = null;
  private socketRunning = false;
  private previewBinding: PreviewBinding | null = null;
  private state: SyncDriverState = { phase: 'paused', detail: 'Synchronization waits until the app is active.' };
  private readonly boundary: MobileConfirmationBoundary;
  constructor(private readonly options: SyncDriverOptions) { this.boundary = new MobileConfirmationBoundary(options.id, options.now); }
  getState(): SyncDriverState { return this.state; }
  private publish(state: SyncDriverState): void { this.state = state; this.options.onState(state); }
  private clearRetry(): void { if (this.retry) clearTimeout(this.retry); this.retry = null; }
  private assertActive(generation: number): void { if (this.closed || !this.foreground || generation !== this.generation) throw new Suspended(); }
  async setForeground(active: boolean): Promise<void> {
    if (this.closed) return;
    this.appActive = active;
    this.foreground = active;
    if (!active) {
      this.generation++; this.requested = false; this.clearRetry();
      await this.realtime?.stop(); this.socketRunning = false;
      this.publish({ ...this.state, phase: this.blocked ? this.state.phase : 'paused', detail: this.blocked ? this.state.detail : 'Synchronization is suspended while Android is in the background.' });
    } else { if (this.flight) await this.flight; if (this.appActive) await this.syncNow(); }
  }
  /** Wait for all prior reads/commits before a lifecycle operation changes the active context. */
  async quiesce(): Promise<void> {
    this.foreground = false; this.generation++; this.requested = false; this.clearRetry();
    await this.realtime?.stop(); this.socketRunning = false;
    await this.flight;
  }
  async stop(): Promise<void> { await this.quiesce(); this.closed = true; this.options.session.clear(); }
  async syncNow(): Promise<void> {
    if (!this.foreground || this.closed || this.blocked) return;
    this.requested = true; this.clearRetry();
    if (this.flight) return this.flight;
    const generation = this.generation;
    const pending = (async () => {
      try {
        do { this.requested = false; await this.round(generation); } while (this.requested && this.foreground && !this.blocked && generation === this.generation);
        this.retries = 0;
      } catch (error) { if (!(error instanceof Suspended)) this.fail(error); }
    })();
    this.flight = pending;
    try { await pending; } finally { if (this.flight === pending) this.flight = null; }
  }
  private fail(error: unknown): void {
    if (error instanceof MobileHubError || error instanceof ReconcileRequired) {
      const code = error instanceof MobileHubError ? error.code : 'authority-changed';
      if (['authority-changed', 'pin-mismatch', 'revoked', 'incompatible', 'key-unavailable', 'key-rejected'].includes(code)) {
        this.blocked = true; this.clearRetry(); void this.realtime?.stop(); this.socketRunning = false;
        this.publish({ phase: code === 'revoked' ? 'revoked' : code === 'incompatible' ? 'incompatible' : 'error',
          detail: error.message, failure: code === 'revoked' ? 'revoked' : code === 'pin-mismatch' ? 'pin' : code.startsWith('key-') ? 'key' : 'authority' });
        return;
      }
    }
    this.publish({ phase: 'offline', detail: error instanceof Error ? error.message : 'The Hub is unreachable. Pending edits are retained.' });
    if (this.foreground && !this.closed) {
      this.clearRetry();
      const delay = Math.min(60_000, 1000 * 2 ** Math.min(this.retries++, 6));
      this.retry = setTimeout(() => { this.retry = null; void this.syncNow(); }, delay);
    }
  }
  private async context(generation: number): Promise<StorageContext> {
    this.assertActive(generation);
    const context = await this.options.store.activeContext();
    const enrollment = this.options.session.getEnrollment();
    if (context.id !== this.options.contextId || context.kind !== 'environment' || !context.writable
      || context.environmentId !== enrollment.environmentId || context.deviceId !== enrollment.deviceId || context.epoch !== enrollment.authorityEpoch) throw new ReconcileRequired('The active environment or Hub authority changed. Review a new connection while preserving local edits.');
    this.assertActive(generation); return context;
  }
  private checkHead(context: StorageContext, head: number, epoch = context.epoch): void {
    if (!Number.isSafeInteger(head) || head < context.head || head < context.cursor || epoch !== context.epoch) throw new ReconcileRequired('The Hub authority or acknowledged history regressed. Preserve this cache and review reconnect.');
  }
  private validateRecords(records: readonly SyncRecord[], categories: readonly MobileCategory[], head: number): void {
    const keys = new Set<string>();
    for (const record of records) {
      if (!categories.includes(categoryOf(record.entityType) as MobileCategory) || record.revision > head || keys.has(keyOf(record))) throw new ReconcileRequired('The Hub returned records outside the reviewed category or revision boundary.');
      keys.add(keyOf(record));
      if (!record.deleted && utf8Size(JSON.stringify(record.payload)) > SYNC_LIMITS.maxRecordBytes) throw new ReconcileRequired('The Hub record exceeds the shared synchronization limit.');
    }
  }
  private async push(generation: number, categories: readonly MobileCategory[], uncertainOnly = false): Promise<void> {
    const context = await this.context(generation);
    const candidates = await this.options.store.pending(context.id);
    if (uncertainOnly && !candidates.some(op => op.claimed && categories.includes(categoryOf(op.entityType) as MobileCategory))) return;
    // Claim at most the number whose worst-case JSON fits the shared request limit. A later entity edit cannot overwrite a claimed row.
    let count = 0; let bytes = 10; const seen = new Set<string>();
    for (const op of candidates) {
      const key = keyOf(op); if (seen.has(key)) continue; seen.add(key);
      if (op.rejected || !categories.includes(categoryOf(op.entityType) as MobileCategory) || uncertainOnly && !op.claimed) continue;
      const size = utf8Size(JSON.stringify(wireOperation(op))) + 1;
      if (size > SYNC_LIMITS.maxPushBytes - 10) throw new ReconcileRequired('A pending operation exceeds the shared request limit. Export pending edits for recovery.');
      if (count >= SYNC_LIMITS.maxPushOps || bytes + size > SYNC_LIMITS.maxPushBytes) break;
      count++; bytes += size;
    }
    if (!count) return;
    this.assertActive(generation);
    const claimed = await this.options.store.claimBatch(context.id, categories, count, uncertainOnly);
    if (!claimed.length) return;
    this.assertActive(generation);
    const operations = claimed.map(wireOperation);
    if (utf8Size(JSON.stringify({ ops: operations })) > SYNC_LIMITS.maxPushBytes) throw new ReconcileRequired('The pending batch exceeded its validated request bound.');
    const response = await this.options.session.withToken((api, token) => api.syncPush(token, operations));
    this.assertActive(generation);
    this.validateAcknowledgements(response, operations);
    await this.options.session.refreshTrust(); this.assertActive(generation);
    this.checkHead(await this.context(generation), response.headRevision);
    await this.options.store.acknowledge(context.id, response.results);
  }
  private validateAcknowledgements(response: SyncPushResponse, operations: readonly SyncOp[]): void {
    const sent = new Set(operations.map(op => op.opId));
    if (response.results.length !== sent.size || new Set(response.results.map(result => result.opId)).size !== sent.size
      || response.results.some(result => !sent.has(result.opId) || (result.status === 'applied' || result.status === 'duplicate') && result.revision > response.headRevision)) throw new ReconcileRequired('The Hub acknowledgement does not match the durable request. Pending edits are preserved.');
  }
  private async round(generation: number): Promise<void> {
    let context = await this.context(generation);
    const categories = selected(context.categories);
    if (!categories.length) { this.publish({ phase: 'paused', detail: 'All synchronization categories are disabled. No records are requested.' }); return; }
    if (!context.consent) { this.publish({ ...this.state, phase: 'needs-consent', detail: 'Review the selected categories before synchronizing.' }); return; }
    if (this.previewBinding) { this.publish({ ...this.state, phase: 'needs-consent', detail: 'A sync preview is open. Review its choices before continuing.' }); return; }
    this.publish({ phase: 'syncing', detail: 'Synchronizing the selected categories…' });
    await this.options.session.refreshTrust(); this.assertActive(generation);
    await this.push(generation, categories);
    for (let page = 0; page < MAX_PULL_PAGES; page++) {
      context = await this.context(generation);
      let response: SyncChangesResponse;
      try { response = await this.options.session.withToken((api, token) => api.syncChanges(token, context.cursor, READ_PAGE, categories)); }
      catch (error) {
        if (!(error instanceof HubApiError) || error.status !== 410 || error.code !== 'cursor-expired') throw error;
        await this.push(generation, categories, true);
        const staged = await this.snapshot(generation, categories);
        await this.options.store.commitSnapshot(staged.stageId, { choices: Object.fromEntries(categories.map(category => [category, 'merge'])), expectedLocalRevision: staged.context.localRevision, preservePending: true });
        continue;
      }
      this.assertActive(generation); this.checkHead(context, response.headRevision, response.authorityEpoch ?? context.epoch);
      this.validateRecords(response.changes, categories, response.headRevision);
      let previous = context.cursor;
      for (const record of response.changes) { if (record.revision <= previous) throw new ReconcileRequired('The Hub change page did not advance in revision order.'); previous = record.revision; }
      if (response.cursor < context.cursor || response.cursor > response.headRevision || previous > response.cursor
        || response.hasMore && (!response.changes.length || response.cursor !== previous)
        || !response.hasMore && response.cursor !== response.headRevision) throw new ReconcileRequired('The Hub change cursor failed its continuation contract.');
      await this.options.store.applyChanges(context.id, response.changes, response.cursor, response.headRevision, response.authorityEpoch ?? context.epoch);
      if (!response.hasMore) break;
      if (page === MAX_PULL_PAGES - 1) this.scheduleContinuation();
    }
    context = await this.context(generation);
    const pending = await this.options.store.pending(context.id);
    const reported = await this.options.session.withToken((api, token) => api.syncReportState(token, {
      cursor: context.cursor, pending: pending.length, quarantined: pending.filter(op => op.rejected).length, conflicts: 0, stranded: 0,
      categories: Object.fromEntries(SYNC_CATEGORY_IDS.map(category => [category, categories.includes(category as MobileCategory)])) as Record<typeof SYNC_CATEGORY_IDS[number], boolean>,
      lastSyncAt: new Date(this.options.now()).toISOString(), paused: false,
    }));
    this.assertActive(generation); this.checkHead(context, reported.headRevision, reported.authorityEpoch ?? context.epoch);
    if (pending.some(op => !op.rejected && categories.includes(categoryOf(op.entityType) as MobileCategory))) this.scheduleContinuation();
    this.publish({ phase: 'live', detail: 'The selected categories are synchronized. Pending edits remain durable until acknowledged.' });
    await this.startRealtime(generation);
  }
  private scheduleContinuation(): void {
    if (!this.retry && this.foreground) this.retry = setTimeout(() => { this.retry = null; void this.syncNow(); }, 250);
  }
  private async startRealtime(generation: number): Promise<void> {
    if (!this.options.realtime || this.socketRunning) return;
    this.assertActive(generation);
    this.realtime ??= new MobileHubRealtime(this.options.session, this.options.realtime, {
      now: this.options.now, onEvent: event => { if (event.event === 'changes-available') void this.syncNow(); },
      onFailure: error => { this.socketRunning = false; if (this.foreground && !this.closed) this.fail(error); },
    });
    this.socketRunning = true;
    try { await this.realtime.start(this.options.id()); } catch (error) { this.socketRunning = false; throw error; }
  }
  private async snapshot(generation: number, categories: readonly MobileCategory[], stable = false): Promise<PreviewBinding> {
    const context = await this.context(generation);
    await this.options.session.refreshTrust(); this.assertActive(generation);
    let next: { afterType: string; afterId: string } | null = null;
    let stageId: string | null = null;
    let head = context.head;
    const visited = new Set<string>();
    do {
      const page = await this.options.session.withToken((api, token) => api.syncSnapshot(token, { ...(next ?? {}), limit: READ_PAGE, categories }));
      this.assertActive(generation); this.checkHead(context, page.asOfRevision, page.authorityEpoch ?? context.epoch);
      if (page.asOfRevision < head) throw new ReconcileRequired('The Hub snapshot head regressed between pages.');
      if (stable && stageId && page.asOfRevision !== head) {
        await this.options.store.discardSnapshot(stageId);
        throw new Error('snapshot-head-changed');
      }
      head = page.asOfRevision; this.validateRecords(page.records, categories, head);
      if (!stageId) stageId = await this.options.store.beginSnapshot(context.id, categories, head, context.epoch);
      for (const record of page.records) {
        const key = keyOf(record); if (visited.has(key)) throw new ReconcileRequired('The Hub snapshot repeated a key.'); visited.add(key);
      }
      if (page.next && (page.records.length === 0 || page.next.afterType !== page.records.at(-1)!.entityType || page.next.afterId !== page.records.at(-1)!.entityId
        || next && (page.next.afterType < next.afterType || page.next.afterType === next.afterType && page.next.afterId <= next.afterId))) throw new ReconcileRequired('The Hub snapshot keyset did not advance.');
      await this.options.store.stageSnapshotPage(stageId, page.records, page.next === null, head);
      next = page.next;
    } while (next);
    const binding = { stageId: stageId!, context, categories, head, epoch: context.epoch, expires: this.options.now() + 60_000 };
    return binding;
  }
  private async exclusive<T>(work: (generation: number) => Promise<T>): Promise<T> {
    while (this.flight) await this.flight;
    const generation = this.generation;
    let value!: T;
    const pending = (async () => { value = await work(generation); })();
    this.flight = pending;
    try { await pending; return value; }
    catch (error) { if (!(error instanceof Suspended) && !(error instanceof Error && error.message.includes('preview'))) this.fail(error); throw error; }
    finally { if (this.flight === pending) this.flight = null; }
  }
  /** Preview binds local revision, current categories, environment, Hub head and authority. */
  async preview(): Promise<FirstSyncPreview | null> {
    return this.exclusive(async generation => {
    const context = await this.context(generation); const categories = selected(context.categories);
    if (!categories.length) { this.previewBinding = null; this.publish({ phase: 'paused', detail: 'All synchronization categories are disabled.' }); return null; }
    if (this.previewBinding) await this.options.store.discardSnapshot(this.previewBinding.stageId);
    this.previewBinding = null;
    let binding: PreviewBinding | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { binding = await this.snapshot(generation, categories, true); break; }
      catch (error) { if (!(error instanceof Error) || error.message !== 'snapshot-head-changed') throw error; }
    }
    if (!binding) throw new Error('The Hub changed throughout this preview. Retry the preview when its records settle.');
    const stage = await this.options.store.stagedSnapshot(binding.stageId);
    const local = await this.options.store.listRecords(context.id);
    const authorityChange = await this.options.store.repairState(context.id);
    const preview = { id: binding.stageId, ...(authorityChange ? { authorityChange } : {}), categories: categories.map(category => ({ category,
      localCount: local.filter(record => !record.deleted && categoryOf(record.entityType) === category).length,
      hubCount: stage.records.filter(record => !record.deleted && categoryOf(record.entityType) === category).length,
    })) };
    this.previewBinding = binding; this.publish({ phase: 'needs-consent', detail: 'Merge keeps the union and uses Hub values for overlaps. Use Hub keeps a local recovery copy. Use local publishes local values.', preview });
    return preview;
    });
  }
  private async approvalState(binding: PreviewBinding, choices: Readonly<Partial<Record<MobileCategory, SnapshotChoice>>>): Promise<ConfirmationState> {
    const context = await this.options.store.activeContext();
    const records = await this.options.store.listRecords(context.id);
    const pending = await this.options.store.pending(context.id);
    return { contextId: context.id, localRevision: context.localRevision, records: records.length, pending: pending.length,
      detail: JSON.stringify({ stageId: binding.stageId, head: binding.head, epoch: binding.epoch, categories: context.categories,
        cursor: context.cursor, localHead: context.head, writable: context.writable,
        enrollment: this.options.session.getEnrollment(), choices: { favorites: choices.favorites ?? null, settings: choices.settings ?? null } }) };
  }
  async previewApproval(choices: Readonly<Partial<Record<MobileCategory, SnapshotChoice>>>, id: string): Promise<DestructivePreview> {
    const binding = this.previewBinding;
    if (!binding || binding.stageId !== id || !binding.categories.some(category => choices[category] === 'hub')
      || binding.categories.some(category => !['merge', 'hub', 'local'].includes(choices[category] ?? ''))) throw new Error('Select Use Hub in a complete sync preview first.');
    const state = await this.approvalState(binding, choices);
    if (state.contextId !== binding.context.id || state.localRevision !== binding.context.localRevision) throw new Error('The sync preview changed. Refresh it.');
    return { token: this.boundary.issue('use-hub', state), pending: state.pending, records: state.records,
      contextId: state.contextId, expiresInSeconds: 60, consequences: MOBILE_LIFECYCLE_CONSEQUENCES['use-hub'] };
  }
  async approve(choices: Readonly<Partial<Record<MobileCategory, SnapshotChoice>>>, id: string, token?: string): Promise<void> {
    let refreshPreview = false;
    await this.exclusive(async generation => {
    const binding = this.previewBinding;
    const context = await this.context(generation);
    if (!binding || binding.stageId !== id || binding.context.id !== context.id || binding.context.localRevision !== context.localRevision
      || JSON.stringify(binding.context.categories) !== JSON.stringify(context.categories) || this.options.now() > binding.expires
      || binding.categories.some(category => !['merge', 'hub', 'local'].includes(choices[category] ?? ''))) throw new Error('The sync preview changed or confirmation is missing. Refresh the preview before approving.');
    if (binding.categories.some(category => choices[category] === 'hub')) this.boundary.consume(token ?? '', 'use-hub', await this.approvalState(binding, choices));
    await this.options.session.refreshTrust(); this.assertActive(generation);
    const fresh = await this.options.session.withToken((api, auth) => api.syncChanges(auth, binding.head, 1, binding.categories));
    this.assertActive(generation); this.checkHead(context, fresh.headRevision, fresh.authorityEpoch ?? context.epoch);
    if (fresh.headRevision !== binding.head) throw new Error('The Hub changed after this preview. Refresh it before approving.');
    // Explicit choice approval permits replay of already claimed deliveries, never fresh pending edits before consent.
    for (let batch = 0; batch < 16; batch++) {
      const uncertain = (await this.options.store.pending(context.id)).filter(op => op.claimed && !op.rejected && binding.categories.includes(categoryOf(op.entityType) as MobileCategory));
      if (!uncertain.length) break;
      await this.push(generation, binding.categories, true);
      if (batch === 15) { refreshPreview = true; return; }
    }
    const afterReplay = await this.options.session.withToken((api, auth) => api.syncChanges(auth, binding.head, 1, binding.categories));
    this.assertActive(generation); this.checkHead(await this.context(generation), afterReplay.headRevision, afterReplay.authorityEpoch ?? context.epoch);
    if (afterReplay.headRevision !== binding.head) { refreshPreview = true; return; }
    await this.options.store.commitSnapshot(binding.stageId, { choices, expectedLocalRevision: binding.context.localRevision });
    this.previewBinding = null; this.publish({ phase: 'syncing', detail: 'Consent saved. Synchronizing the selected categories…' });
    });
    if (refreshPreview) { await this.preview(); throw new Error('Uncertain deliveries were resolved. Review the refreshed sync preview before approving its choices.'); }
    await this.syncNow();
  }
  async setCategory(category: MobileCategory, enabled: boolean): Promise<void> {
    if (!CATEGORIES.includes(category)) throw new Error('Unknown mobile synchronization category.');
    await this.quiesce();
    const context = await this.options.store.activeContext();
    if (context.id !== this.options.contextId) throw new Error('The active context changed.');
    this.previewBinding = null;
    await this.options.store.setCategories(context.id, { ...context.categories, [category]: enabled });
    this.foreground = this.appActive;
    if (this.appActive) { if (enabled) await this.preview(); else await this.syncNow(); }
  }
}
