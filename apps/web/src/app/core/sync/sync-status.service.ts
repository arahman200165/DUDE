import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import type { AgentSyncStatus, QuarantinedOpView, SyncConflictChoice, SyncConflictView } from '@dude/contracts';
import type { SyncCategory } from '@dude/sync';
import { RemoteChangesService } from './remote-changes.service';
import { SYNC_PORT, SyncError, type ConflictResolution, type SyncPort } from './sync.port';

/**
 * Renderer-side sync state (desktop, and the Hub-served browser through its own port). Holds the Agent's latest `AgentSyncStatus`, the conflict inbox and the
 * quarantine list. Constructing it (the app initializer does, at bootstrap) subscribes the bridge's `onApplied` to
 * `RemoteChangesService.apply`, so remote changes reach open signals even when Settings is never opened. On the Pages
 * build the port is null: every signal stays empty and nothing is subscribed.
 */
@Injectable({ providedIn: 'root' })
export class SyncStatusService {
  private readonly port = inject(SYNC_PORT);
  private readonly remote = inject(RemoteChangesService);

  private readonly statusState = signal<AgentSyncStatus | null>(null);
  private readonly conflictsState = signal<readonly SyncConflictView[]>([]);
  private readonly quarantinedState = signal<readonly QuarantinedOpView[]>([]);
  private readonly busyState = signal(false);
  private readonly errorState = signal<string | null>(null);

  readonly available = this.port !== null;
  /** The Hub-served browser's sync: no pause, inbox, quarantine or first sync, and browser wording. */
  readonly web = this.port?.host === 'web';
  readonly status = this.statusState.asReadonly();
  readonly conflicts = this.conflictsState.asReadonly();
  readonly quarantined = this.quarantinedState.asReadonly();
  readonly busy = this.busyState.asReadonly();
  readonly error = this.errorState.asReadonly();
  /** True once this device is paired with a Hub (anything but standalone). */
  readonly enrolled = computed(() => {
    const phase = this.statusState()?.phase;
    return phase !== undefined && phase !== 'standalone';
  });

  constructor() {
    const port = this.port;
    if (port === null) return;
    const offStatus = port.onStatusChanged((status) => this.adopt(status));
    const offApplied = port.onApplied((changes) => this.remote.apply(changes));
    inject(DestroyRef).onDestroy(() => { offStatus(); offApplied(); });
    void this.refresh();
  }

  /** Re-reads status; the conflict and quarantine lists reload when their counts changed. */
  async refresh(): Promise<void> {
    if (this.port === null) return;
    try {
      this.adopt(await this.port.status());
      this.errorState.set(null);
    } catch (error) {
      this.errorState.set(messageOf(error));
    }
  }

  async syncNow(): Promise<void> { await this.act((p) => p.syncNow()); }
  async setPaused(paused: boolean): Promise<void> { await this.act((p) => p.setPaused(paused)); }
  async setCategory(id: SyncCategory, enabled: boolean): Promise<void> { await this.act((p) => p.setCategories({ [id]: enabled })); }

  async resolveConflict(id: number, choice: SyncConflictChoice): Promise<ConflictResolution> {
    const port = this.port;
    if (port === null) return { ok: false, error: 'Sync is not available.' };
    try {
      const result = await port.resolveConflict(id, choice);
      if (result.ok) {
        this.conflictsState.update((list) => list.filter((c) => c.id !== id));
        await this.refresh();
      }
      return result;
    } catch (error) {
      return { ok: false, error: messageOf(error) };
    }
  }

  async retryQuarantined(opIds?: readonly string[]): Promise<void> {
    const port = this.port;
    if (port === null) return;
    await this.guarded(async () => {
      await port.retryQuarantined(opIds);
      this.quarantinedState.set(await port.listQuarantined());
      await this.refresh();
    });
  }

  /** After a discard or any action that changed the lists behind the service's back. */
  async reload(): Promise<void> {
    const port = this.port;
    if (port === null) return;
    await this.guarded(async () => {
      this.adopt(await port.status());
      this.conflictsState.set(await port.listConflicts());
      this.quarantinedState.set(await port.listQuarantined());
    });
  }

  private adopt(status: AgentSyncStatus): void {
    const previous = this.statusState();
    this.statusState.set(status);
    if (previous === null || previous.conflicts !== status.conflicts) void this.loadConflicts(status);
    if (previous === null || previous.quarantined !== status.quarantined) void this.loadQuarantined(status);
  }

  private async loadConflicts(status: AgentSyncStatus): Promise<void> {
    const port = this.port;
    if (port === null) return;
    if (status.conflicts === 0) { this.conflictsState.set([]); return; }
    try { this.conflictsState.set(await port.listConflicts()); } catch (error) { this.errorState.set(messageOf(error)); }
  }

  private async loadQuarantined(status: AgentSyncStatus): Promise<void> {
    const port = this.port;
    if (port === null) return;
    if (status.quarantined === 0) { this.quarantinedState.set([]); return; }
    try { this.quarantinedState.set(await port.listQuarantined()); } catch (error) { this.errorState.set(messageOf(error)); }
  }

  private async act(call: (port: SyncPort) => Promise<AgentSyncStatus>): Promise<void> {
    const port = this.port;
    if (port === null) return;
    await this.guarded(async () => this.adopt(await call(port)));
  }

  private async guarded(work: () => Promise<void>): Promise<void> {
    this.busyState.set(true);
    this.errorState.set(null);
    try { await work(); } catch (error) { this.errorState.set(messageOf(error)); } finally { this.busyState.set(false); }
  }
}

function messageOf(error: unknown): string {
  return error instanceof SyncError || error instanceof Error ? error.message : 'The sync request failed.';
}
