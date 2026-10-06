import { DEFAULT_APPEARANCE } from '@dude/domain/core/appearance/appearance.model';
import type { MobileHubPorts } from '../hub/types';
import { MobileHubError } from '../hub/types';
import { MobileEnrollmentService } from '../hub/enrollment';
import { MobileDeviceSession } from '../hub/session';
import type { MobileRealtimePort } from '../hub/native';
import { MobileSyncDriver, type SyncDriverState } from '../sync/driver';
import type { MobileStore } from '../storage/store';
import type { StorageContext } from '../storage/types';
import { INITIAL_WORKBENCH, patchAppearanceFields, type ActionResult, type ConnectionInput, type DestructivePreview, type WorkbenchActions, type WorkbenchBackend, type WorkbenchSnapshot } from './workbench-model';

/** Installed by the lifecycle owner; sync cannot invoke destructive methods as an error response. */
export interface MobileLifecyclePort {
  previewDisconnect(): Promise<DestructivePreview>;
  disconnect(token: string): Promise<{ warning?: string }>;
  previewClearCache(): Promise<DestructivePreview>;
  clearCache(token: string): Promise<void>;
  previewDiscardAttempt(): Promise<DestructivePreview>;
  discardAttempt(token: string): Promise<void>;
  previewStandalone(contextId: string): Promise<DestructivePreview>;
  continueStandalone(token: string, contextId: string): Promise<void>;
  exportRecovery(contextId?: string): Promise<{ text: string }>;
  exportRecoveryCopy(copyId: string): Promise<{ text: string }>;
  importRecovery(text: string): Promise<void>;
  selectArchive(contextId: string): Promise<void>;
}
export interface DurableWorkbenchOptions {
  readonly store: MobileStore;
  readonly ports: Omit<MobileHubPorts, 'persistence'>;
  readonly installId: string;
  readonly deviceId: string;
  readonly appVersion: string;
  readonly realtime?: MobileRealtimePort;
  readonly now: () => number;
  readonly id: () => string;
}
const unavailable = (): never => { throw new Error('This lifecycle action is not available.'); };
const object = (value: unknown): value is Readonly<Record<string, unknown>> => value !== null && typeof value === 'object' && !Array.isArray(value);

/** UI reads cached snapshots; every edit resolves only after its SQLite transaction commits. */
export class DurableWorkbench implements WorkbenchBackend {
  readonly store: MobileStore;
  readonly ports: MobileHubPorts;
  driver: MobileSyncDriver | null = null;
  session: MobileDeviceSession | null = null;
  enrollment: MobileEnrollmentService;
  readonly actions: WorkbenchActions;
  private lifecycle: MobileLifecyclePort | null = null;
  private snapshot: WorkbenchSnapshot = { ...INITIAL_WORKBENCH, durability: 'durable' };
  private driverState: SyncDriverState | null = null;
  private readonly listeners = new Set<() => void>();
  private unsubscribe: (() => void) | null = null;
  private refreshFlight: Promise<void> | null = null;
  private refreshAgain = false;
  private closed = false;
  private foreground = false;
  private busy = false;
  private warning: string | undefined;
  private cleanupWarning: string | undefined;
  constructor(readonly options: DurableWorkbenchOptions) {
    this.store = options.store; this.ports = { ...options.ports, persistence: options.store, now: options.now };
    this.enrollment = this.enrollmentService(options.deviceId);
    const actions = {
      patchAppearance: (patch: Parameters<WorkbenchActions['patchAppearance']>[0]) => this.run(async () => {
        const context = await this.store.activeContext();
        const repository = this.store.kvRepository(context.id);
        const raw = await repository.get('settings', 'appearance');
        await repository.set('settings', 'appearance', patchAppearanceFields(object(raw) ? raw : DEFAULT_APPEARANCE as unknown as Record<string, unknown>, patch), { policy: 'local', scope: 'environment' });
        void this.driver?.syncNow();
      }),
      setFavorite: (item: Parameters<WorkbenchActions['setFavorite']>[0], pinned: boolean) => this.run(async () => {
        const repository = this.store.favoriteRepository((await this.store.activeContext()).id);
        if (pinned) await repository.upsert(item); else await repository.remove(item.id);
        void this.driver?.syncNow();
      }),
      connect: (input: ConnectionInput) => this.run(() => this.connect(input)),
      syncNow: () => this.run(async () => {
        const driver = this.requireDriver(); await driver.setForeground(this.foreground);
        if (['error', 'offline', 'revoked', 'incompatible'].includes(driver.getState().phase)) throw new Error(driver.getState().detail);
      }),
      previewSync: () => this.run(async () => { await this.requireDriver().preview(); }),
      previewSyncApproval: (choices: Parameters<WorkbenchActions['approveSync']>[0], previewId: string) => this.result(() => this.requireDriver().previewApproval(choices, previewId)),
      approveSync: (choices: Parameters<WorkbenchActions['approveSync']>[0], previewId: string, token?: string) => this.run(() => this.requireDriver().approve(choices, previewId, token)),
      setSyncCategory: (category: Parameters<WorkbenchActions['setSyncCategory']>[0], enabled: boolean) => this.run(() => this.requireDriver().setCategory(category, enabled)),
      recover: () => this.run(async () => {
        await this.quiesce();
        try {
          if (!await this.store.readPendingAttempt() && !(await this.store.activeContext()).writable) throw new Error('This cached environment needs a reviewed pairing string before it can reconnect.');
          await this.enrollment.recoverPending();
        } finally { await this.changed(); }
        if (this.driver && !(await this.store.activeContext()).consent && this.foreground) await this.driver.preview();
      }),
      rePair: (input: ConnectionInput, contextId?: string) => this.run(async () => {
        await this.quiesce();
        try {
          const existing = await this.store.readEnrollment();
          if (contextId && existing && (await this.store.context(contextId)).deviceId !== existing.deviceId) throw new Error('Disconnect the current enrolled environment before re-pairing this archive.');
          if (contextId) await this.store.activateArchiveForPairing(contextId);
          const context = await this.store.activeContext();
          this.enrollment = this.enrollmentService(context.deviceId);
          await this.enrollment.connect(input, await this.store.readEnrollment() ? 'reconnect' : 'enroll');
        } finally { await this.changed(); }
      }),
      previewDisconnect: () => this.result(() => this.requireLifecycle().previewDisconnect()),
      disconnect: (token: string) => this.run(async () => { const result = await this.requireLifecycle().disconnect(token); this.warning = result.warning; }),
      previewClearCache: () => this.result(() => this.requireLifecycle().previewClearCache()),
      clearCache: (token: string) => this.run(() => this.requireLifecycle().clearCache(token)),
      previewDiscardAttempt: () => this.result(() => this.requireLifecycle().previewDiscardAttempt()),
      discardAttempt: (token: string) => this.run(() => this.requireLifecycle().discardAttempt(token)),
      previewStandalone: (contextId: string) => this.result(() => this.requireLifecycle().previewStandalone(contextId)),
      continueStandalone: (token: string, contextId: string) => this.run(() => this.requireLifecycle().continueStandalone(token, contextId)),
      exportRecovery: (contextId?: string) => this.result(() => this.requireLifecycle().exportRecovery(contextId)),
      exportRecoveryCopy: (copyId: string) => this.result(() => this.requireLifecycle().exportRecoveryCopy(copyId)),
      importRecovery: (text: string) => this.run(() => this.requireLifecycle().importRecovery(text)),
      selectArchive: (contextId: string) => this.run(async () => { await this.quiesce(); await this.requireLifecycle().selectArchive(contextId); }),
    };
    this.actions = actions;
  }
  private enrollmentService(deviceId: string): MobileEnrollmentService {
    return new MobileEnrollmentService({ ...this.ports, deviceId, installId: this.options.installId, appVersion: this.options.appVersion,
      beforeReconnect: async () => { await this.quiesce(); await this.store.createRecoveryCopy((await this.store.activeContext()).id, 'before-reconnect'); },
      onReconnected: async previous => { await this.ports.signer.deleteKey(previous.keyRef); await this.store.completeKeyCleanup(previous.keyRef); },
    });
  }
  async start(): Promise<void> {
    this.unsubscribe = this.store.subscribe(() => { void this.refresh().catch(error => this.storageFailure(error)); });
    await this.changed();
  }
  installLifecycle(lifecycle: MobileLifecyclePort): void { this.lifecycle = lifecycle; void this.refresh().catch(error => this.storageFailure(error)); }
  private requireLifecycle(): MobileLifecyclePort { return this.lifecycle ?? unavailable(); }
  private requireDriver(): MobileSyncDriver { return this.driver ?? unavailable(); }
  getSnapshot(): WorkbenchSnapshot { return this.snapshot; }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private publish(snapshot: WorkbenchSnapshot): void { if (this.closed) return; this.snapshot = snapshot; this.listeners.forEach(listener => listener()); }
  private storageFailure(error: unknown): void {
    void this.driver?.quiesce();
    this.publish({ ...this.snapshot, connection: { kind: 'reauth-required', detail: error instanceof Error ? error.message : 'Durable storage is unavailable. Preserve app data and retry.' },
      sync: { ...this.snapshot.sync, phase: 'error', detail: 'Durable storage failed. Editing is disabled until storage can be reopened.' },
      capabilities: { appearance: false, favorites: false, connect: false, disconnect: false, sync: false, recover: false, clearCache: false, exportRecovery: false } });
  }
  async refresh(): Promise<void> {
    this.refreshAgain = true;
    if (this.refreshFlight) return this.refreshFlight;
    const pending = (async () => { do { this.refreshAgain = false; await this.refreshOnce(); } while (this.refreshAgain && !this.closed); })();
    this.refreshFlight = pending;
    try { await pending; } finally { if (this.refreshFlight === pending) this.refreshFlight = null; }
  }
  private async refreshOnce(): Promise<void> {
    const context = await this.store.activeContext();
    const [favorites, rawAppearance, pending, enrollment, attempt, contexts] = await Promise.all([
      this.store.favoriteRepository(context.id).list(), this.store.kvRepository(context.id).get('settings', 'appearance'),
      this.store.pending(context.id), this.store.readEnrollment(), this.store.readPendingAttempt(), this.store.contexts(),
    ]);
    const policyStore = this.store as MobileStore & { failureState?: (id: string) => Promise<'revoked' | 'missing-key' | 'authority-changed' | null> };
    const failure = await policyStore.failureState?.(context.id);
    const state = this.driverState;
    const belongs = enrollment && context.kind === 'environment' && enrollment.environmentId === context.environmentId && enrollment.deviceId === context.deviceId;
    const kind: WorkbenchSnapshot['connection']['kind'] = state?.failure === 'revoked' || failure === 'revoked' ? 'revoked' : state?.failure === 'pin' ? 'untrusted-certificate'
      : state?.failure === 'authority' || failure === 'authority-changed' ? 'restore-repair-required' : state?.failure === 'key' || failure === 'missing-key' ? 'reauth-required'
        : state?.phase === 'incompatible' ? 'incompatible' : state?.phase === 'offline' ? 'unreachable'
          : belongs ? context.writable ? 'connected' : 'revoked' : context.kind === 'standalone' ? 'standalone' : 'reauth-required';
    const archives = await Promise.all(contexts.filter(item => item.kind === 'archive' || !item.writable).map(async item => ({
      id: item.id, environmentId: item.environmentId, deviceId: item.deviceId, kind: item.kind as 'archive' | 'environment', selected: item.id === context.id,
      records: (await this.store.listRecords(item.id)).length, pending: (await this.store.pending(item.id)).length,
    })));
    const copies = (await Promise.all(contexts.map(async item => (await this.store.recoveryCopies(item.id)).map(copy => ({ ...copy, contextId: item.id }))))).flat();
    this.publish({ appearance: object(rawAppearance) ? rawAppearance : { ...DEFAULT_APPEARANCE }, favorites, durability: 'durable',
      connection: { kind, detail: belongs ? state?.detail ?? 'This Android device is registered. Select categories and review synchronization.'
        : context.kind === 'standalone' ? 'Favorites and appearance are stored privately on this device.' : 'Read-only cached environment. Export it or review a pairing before editing.', environmentName: belongs ? context.environmentId : undefined },
      sync: { phase: context.kind === 'standalone' ? 'local-only' : state?.phase ?? (context.consent ? 'paused' : 'needs-consent'),
        detail: state?.detail ?? (attempt ? 'A registration receipt is pending. Recover it before creating another identity.' : 'Choose the categories to synchronize.'),
        pending: pending.length, conflicts: pending.filter(op => op.rejected).length,
        categories: ['favorites', 'settings'].map(category => ({ category: category as 'favorites' | 'settings', enabled: context.categories[category as 'favorites' | 'settings'] })),
      }, firstSyncPreview: state?.preview,
      recovery: { contextId: context.id, pendingAttempt: attempt !== null, archives, copies,
        standaloneContextId: contexts.find(item => item.kind === 'standalone')!.id,
        enrolledContextId: enrollment ? contexts.find(item => item.kind === 'environment' && item.environmentId === enrollment.environmentId && item.deviceId === enrollment.deviceId)?.id : undefined,
        ...((this.warning || this.cleanupWarning) ? { warning: [this.warning, this.cleanupWarning].filter(Boolean).join(' ') } : {}) },
      capabilities: { appearance: context.writable && !failure && !state?.failure, favorites: context.writable && !failure && !state?.failure,
        connect: !attempt && (!enrollment || kind !== 'connected'),
        disconnect: !!this.lifecycle && !!belongs, sync: !!belongs && context.writable && !!this.driver, recover: !!attempt || !!enrollment,
        clearCache: !!this.lifecycle, exportRecovery: !!this.lifecycle },
    });
  }
  private async driverChanged(state: SyncDriverState): Promise<void> {
    this.driverState = state;
    const policyStore = this.store as MobileStore & { freezeEnvironment?: (reason: 'revoked' | 'missing-key' | 'authority-changed') => Promise<void> };
    if (state.failure === 'revoked' || state.failure === 'key' || state.failure === 'authority') {
      if (policyStore.freezeEnvironment) await policyStore.freezeEnvironment(state.failure === 'revoked' ? 'revoked' : state.failure === 'key' ? 'missing-key' : 'authority-changed');
      else if (state.failure === 'revoked') await this.store.archiveActive('revoked');
    }
    await this.refresh();
  }
  async changed(): Promise<void> {
    await this.driver?.stop(); this.driver = null; this.session?.clear(); this.session = null; this.driverState = null;
    const context = await this.store.activeContext(); const enrollment = await this.store.readEnrollment();
    this.enrollment = this.enrollmentService(enrollment?.deviceId ?? context.deviceId);
    if (enrollment) {
      this.session = new MobileDeviceSession(this.ports, enrollment);
      if (context.kind === 'environment' && context.writable && enrollment.environmentId === context.environmentId && enrollment.deviceId === context.deviceId) {
        try {
          if (await this.ports.signer.publicKey(enrollment.keyRef) !== enrollment.publicKey) throw new MobileHubError('key-unavailable', 'The local signing key does not match its saved identity. Review a new pairing while preserving this cache.');
        } catch (error) {
          if (!(error instanceof MobileHubError)) throw error;
          await this.driverChanged({ phase: 'error', failure: 'key', detail: error.message });
          return;
        }
        this.driver = new MobileSyncDriver({ store: this.store, session: this.session, contextId: context.id, id: this.options.id,
          now: this.options.now, realtime: this.options.realtime, onState: state => { void this.driverChanged(state).catch(error => this.storageFailure(error)); } });
      }
    }
    this.cleanupWarning = undefined;
    for (const keyRef of await this.store.pendingKeyCleanup()) {
      try { await this.ports.signer.deleteKey(keyRef); await this.store.completeKeyCleanup(keyRef); }
      catch { this.cleanupWarning = 'The new enrollment is saved, but an old signing key could not be deleted. Use Recover to retry cleanup; cleanup also retries when the workbench reopens.'; }
    }
    await this.refresh();
    if (this.foreground) await this.driver?.setForeground(true);
  }
  async setForeground(active: boolean): Promise<void> { this.foreground = active; await this.driver?.setForeground(active); }
  async quiesce(): Promise<void> { await this.driver?.quiesce(); }
  async unenroll(): Promise<void> {
    const context = await this.store.activeContext();
    const policyStore = this.store as MobileStore & { failureState?: (id: string) => Promise<string | null> };
    if (this.driverState?.failure || await policyStore.failureState?.(context.id)) throw new Error('This device cannot contact its former Hub authority safely. Revoke its registry row from the Hub owner UI if still active.');
    if (!this.session) throw new Error('No device session is available.');
    await this.session.withToken((api, token) => api.unenrollSelf(token));
  }
  async close(): Promise<void> { this.closed = true; this.unsubscribe?.(); await this.driver?.stop(); this.session?.clear(); await this.refreshFlight; await this.store.database.close(); }
  private async connect(input: ConnectionInput): Promise<void> {
    if (await this.store.readPendingAttempt()) throw new Error('Recover or explicitly discard the pending registration before connecting.');
    this.publish({ ...this.snapshot, connection: { kind: 'connecting', detail: 'Registering the reviewed Android device…' } });
    try { await this.enrollment.connect(input); await this.changed(); }
    catch (error) {
      if (error instanceof MobileHubError) this.driverState = { phase: error.code === 'incompatible' ? 'incompatible' : 'error', detail: error.message,
        failure: error.code === 'pin-mismatch' ? 'pin' : error.code === 'authority-changed' ? 'authority' : undefined };
      else this.driverState = { phase: 'offline', detail: 'Registration could not be confirmed. Recover the saved receipt if one was written.' };
      throw error;
    }
  }
  private async run(work: () => Promise<void>): Promise<ActionResult> { return this.result(async () => { await work(); return undefined; }); }
  private async result<T>(work: () => Promise<T>): Promise<ActionResult<T>> {
    if (this.busy || this.closed) return { ok: false, reason: 'Another action is running. Wait for it to finish.' };
    this.busy = true;
    try { const value = await work(); await this.refresh(); return { ok: true, value }; }
    catch (error) {
      await this.refresh().catch(issue => this.storageFailure(issue));
      if (this.foreground && this.driver && !this.driver.getState().failure) void this.driver.setForeground(true);
      return { ok: false, reason: error instanceof Error ? error.message : 'The action could not be completed. Local state is preserved.' };
    }
    finally { this.busy = false; }
  }
}
