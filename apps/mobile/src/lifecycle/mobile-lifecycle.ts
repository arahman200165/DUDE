import type { MobileStore } from '../storage/store';
import type { StorageContext } from '../storage/types';
import type { MobileHubPorts } from '../hub/types';
import type { MobileEnrollmentService } from '../hub/enrollment';
import type { DestructivePreview } from '../state/workbench-model';
import { MobileConfirmationBoundary, MOBILE_LIFECYCLE_CONSEQUENCES, type ConfirmationState, type LifecycleAction } from './confirmation';

export interface LifecycleHooks {
  /** Wait for any in-flight push to settle before key removal or context mutation. */
  readonly stopSync: () => Promise<void>;
  readonly unenroll: () => Promise<void>;
  readonly changed: () => Promise<void>;
}
/** Settings-only lifecycle. Remote events can freeze data, but cannot call these destructive methods. */
export class MobileLifecycle {
  private readonly boundary: MobileConfirmationBoundary;
  private busy = false;
  constructor(private readonly store: MobileStore, private readonly ports: MobileHubPorts,
    private readonly enrollment: MobileEnrollmentService, private readonly hooks: LifecycleHooks,
    options: { readonly id: () => string; readonly now: () => number }) {
    this.boundary = new MobileConfirmationBoundary(options.id, options.now);
  }
  private async state(contextId?: string, detail = ''): Promise<ConfirmationState & { readonly standaloneRevision: number }> {
    const context = contextId ? await this.store.context(contextId) : await this.store.activeContext();
    const [records, pending, enrollment, attempt, active, contexts] = await Promise.all([
      this.store.listRecords(context.id), this.store.pending(context.id), this.store.readEnrollment(), this.store.readPendingAttempt(), this.store.activeContext(), this.store.contexts(),
    ]);
    return { contextId: context.id, localRevision: context.localRevision, records: records.length, pending: pending.length,
      standaloneRevision: contexts.find(item => item.kind === 'standalone')?.localRevision ?? -1,
      detail: JSON.stringify({ detail, activeContextId: active.id, standalone: contexts.filter(item => item.kind === 'standalone').map(item => ({ id: item.id, localRevision: item.localRevision })), categories: context.categories, consent: context.consent, kind: context.kind,
        writable: context.writable, cursor: context.cursor, head: context.head, epoch: context.epoch,
        enrollment: enrollment && { deviceId: enrollment.deviceId, environmentId: enrollment.environmentId, hubInstanceId: enrollment.hubInstanceId, keyRef: enrollment.keyRef },
        attempt: attempt && { deviceId: attempt.deviceId, environmentId: attempt.environmentId, keyRef: attempt.keyRef, createdAt: attempt.createdAt } }) };
  }
  private preview(action: LifecycleAction, state: ConfirmationState): DestructivePreview {
    return { token: this.boundary.issue(action, state), pending: state.pending, records: state.records,
      contextId: state.contextId, expiresInSeconds: 60, consequences: MOBILE_LIFECYCLE_CONSEQUENCES[action] };
  }
  private async exclusive<T>(run: () => Promise<T>): Promise<T> {
    if (this.busy) throw new Error('Another lifecycle action is running. Wait for it to finish.');
    this.busy = true;
    try { return await run(); } finally { this.busy = false; }
  }
  async previewDisconnect(): Promise<DestructivePreview> {
    const enrollment = await this.store.readEnrollment();
    const context = await this.store.activeContext();
    if (await this.store.readPendingAttempt()) throw new Error('Recover or explicitly discard the pending registration before disconnecting the enrolled environment.');
    if (!enrollment || context.kind !== 'environment' || context.environmentId !== enrollment.environmentId || context.deviceId !== enrollment.deviceId) throw new Error('Select the enrolled environment before reviewing disconnect.');
    return this.preview('disconnect', await this.state());
  }
  async disconnect(token: string): Promise<{ warning?: string }> {
    return this.exclusive(async () => {
      await this.hooks.stopSync();
      const state = await this.state();
      this.boundary.consume(token, 'disconnect', state);
      const enrollment = await this.store.readEnrollment();
      if (!enrollment) throw new Error('The enrollment changed. Review disconnect again.');
      await this.store.createRecoveryCopy(state.contextId, 'before-disconnect');
      let warning: string | undefined;
      try { await this.hooks.unenroll(); }
      catch { warning = 'The Hub could not be reached. This device is disconnected locally; its Hub row may remain active. Ask the Hub owner to revoke it in Devices.'; }
      // Recovery is durable before any credential is erased. On failure, keep the enrollment and archive intact for retry.
      await this.ports.signer.deleteKey(enrollment.keyRef);
      await this.store.archiveActive('disconnect');
      await this.hooks.changed();
      return warning ? { warning } : {};
    });
  }
  async previewClearCache(contextId?: string): Promise<DestructivePreview> { return this.preview('clear-cache', await this.state(contextId)); }
  async clearCache(token: string, contextId?: string): Promise<void> {
    await this.exclusive(async () => {
      await this.hooks.stopSync();
      const state = await this.state(contextId);
      this.boundary.consume(token, 'clear-cache', state);
      await this.store.clearContext(state.contextId, state.localRevision);
      await this.hooks.changed();
    });
  }
  async previewDiscardAttempt(): Promise<DestructivePreview> {
    if (!await this.store.readPendingAttempt()) throw new Error('There is no pending registration attempt.');
    return this.preview('discard-attempt', await this.state());
  }
  async discardAttempt(token: string): Promise<void> {
    await this.exclusive(async () => {
      await this.hooks.stopSync();
      const state = await this.state();
      this.boundary.consume(token, 'discard-attempt', state);
      if (!await this.store.readPendingAttempt()) throw new Error('The pending registration changed.');
      await this.store.createRecoveryCopy(state.contextId, 'before-discard-attempt');
      await this.enrollment.discardPendingAttempt();
      await this.hooks.changed();
    });
  }
  async previewStandalone(contextId: string): Promise<DestructivePreview> {
    const context = await this.store.context(contextId);
    if (context.kind !== 'archive') throw new Error('Disconnect this environment to preserve an archive before copying it to standalone.');
    const state = await this.conversionState(contextId);
    return { ...this.preview('continue-standalone', state), targetRecords: state.targetRecords, targetPending: state.targetPending };
  }
  private async conversionState(contextId: string): Promise<ConfirmationState & { readonly standaloneRevision: number; readonly targetRecords: number; readonly targetPending: number }> {
    const state = await this.state(contextId);
    const target = (await this.store.contexts()).find(context => context.kind === 'standalone');
    if (!target) throw new Error('The standalone workbench is unavailable. Preserve storage and recover.');
    const [records, pending] = await Promise.all([this.store.listRecords(target.id), this.store.pending(target.id)]);
    return { ...state, targetRecords: records.length, targetPending: pending.length };
  }
  async continueStandalone(token: string, contextId: string): Promise<void> {
    await this.exclusive(async () => {
      await this.hooks.stopSync();
      const state = await this.conversionState(contextId);
      this.boundary.consume(token, 'continue-standalone', state);
      // Copy, never move: archives and pending operations remain available for later re-pairing.
      await this.store.convertArchiveToStandalone(contextId, state.localRevision, state.standaloneRevision);
      await this.hooks.changed();
    });
  }
  async exportRecovery(contextId?: string): Promise<{ text: string }> {
    const context = contextId ? await this.store.context(contextId) : await this.store.activeContext();
    return { text: JSON.stringify(await this.store.exportRecovery(context.id), null, 2) };
  }
  async exportRecoveryCopy(copyId: string): Promise<{ text: string }> {
    return { text: JSON.stringify(await this.store.readRecoveryCopy(copyId), null, 2) };
  }
  async importRecovery(text: string): Promise<void> {
    await this.exclusive(async () => { await this.hooks.stopSync(); await this.store.importRecovery(text); await this.hooks.changed(); });
  }
  async archives(): Promise<readonly StorageContext[]> { return (await this.store.contexts()).filter(context => context.kind === 'archive' || !context.writable); }
  async selectArchive(contextId: string): Promise<void> {
    await this.exclusive(async () => {
      await this.hooks.stopSync();
      const context = await this.store.context(contextId);
      const enrollment = await this.store.readEnrollment();
      const enrolled = context.kind === 'environment' && enrollment?.environmentId === context.environmentId && enrollment.deviceId === context.deviceId;
      if (context.kind !== 'archive' && context.kind !== 'standalone' && !enrolled && context.writable) throw new Error('Select a retained context or the enrolled environment.');
      await this.store.selectContext(contextId);
      await this.hooks.changed();
    });
  }
}
