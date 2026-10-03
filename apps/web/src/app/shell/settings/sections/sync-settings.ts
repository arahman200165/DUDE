import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AgentStandalonePreview } from '@dude/contracts';
import { SYNC_CATEGORIES, type SyncCategory } from '@dude/sync';
import { workspaceLayoutCodec } from '@dude/persistence';
import { RemoteChangesService } from '../../../core/sync/remote-changes.service';
import { SYNC_PORT } from '../../../core/sync/sync.port';
import { SyncStatusService } from '../../../core/sync/sync-status.service';
import { WorkspaceLayoutService } from '../../../core/workspace/workspace-layout.service';
import { ConflictInbox } from './sync/conflict-inbox';
import { FirstSyncWizard } from './sync/first-sync-wizard';
import { HubWebSync } from './sync/hub-web-sync';
import { QuarantineList } from './sync/quarantine-list';

const DEFAULT_OFF_RATIONALE: Partial<Record<SyncCategory, string>> = {
  usage: 'Off by default: usage counts describe how you work, so they only leave this device if you choose. Each device keeps its own record.',
  'workspace-layout': 'Off by default: each device usually has its own screen. A synced layout is offered on request or applied on the next launch, never mid-session.',
  scratchpad: 'Off by default: the scratchpad is free text and may contain sensitive content such as tokens or notes. It is sent to your Hub as written.',
};

/**
 * Settings > Sync. Desktop renders the full section; the Hub-served web renders `HubWebSync` (its own state, Web access, device table). State and actions come from `SyncStatusService`/`SYNC_PORT`; every destructive step
 * (Use Hub on first sync, Continue standalone, Discard) is a preview followed by an explicit confirmation.
 */
@Component({
  selector: 'app-sync-settings',
  imports: [RouterLink, FirstSyncWizard, ConflictInbox, QuarantineList, HubWebSync],
  templateUrl: './sync-settings.html',
})
export class SyncSettings {
  private readonly port = inject(SYNC_PORT);
  private readonly remote = inject(RemoteChangesService);
  private readonly layout = inject(WorkspaceLayoutService);
  protected readonly sync = inject(SyncStatusService);

  protected readonly status = this.sync.status;
  protected readonly categories = SYNC_CATEGORIES;
  protected readonly layoutAvailable = this.remote.syncedLayoutAvailable;
  protected readonly layoutError = signal<string | null>(null);

  protected readonly wizardOpen = signal(false);
  protected readonly standalone = signal<AgentStandalonePreview | null>(null);
  protected readonly standaloneBusy = signal(false);
  protected readonly standaloneError = signal<string | null>(null);

  protected readonly phase = computed(() => this.status()?.phase ?? null);
  protected readonly syncingAllowed = computed(() => {
    const phase = this.phase();
    return phase !== null && phase !== 'standalone' && phase !== 'needs-first-sync' && phase !== 'revoked' && phase !== 'hub-outdated';
  });
  protected readonly lastSync = computed(() => {
    const at = this.status()?.lastSyncAt;
    return at ? new Date(at).toLocaleString() : 'Never';
  });

  protected rationale(id: SyncCategory): string | undefined { return DEFAULT_OFF_RATIONALE[id]; }
  protected enabled(id: SyncCategory): boolean { return this.status()?.categories[id] === true; }

  protected onToggle(id: SyncCategory, event: Event): void {
    void this.sync.setCategory(id, (event.target as HTMLInputElement).checked);
  }

  protected onWizardFinished(): void { this.wizardOpen.set(false); }

  /** Step one of Continue standalone: previews what changes, nothing is altered yet. */
  protected async previewStandalone(): Promise<void> {
    const port = this.port;
    if (port === null) return;
    this.standaloneBusy.set(true);
    this.standaloneError.set(null);
    try { this.standalone.set(await port.standalonePreview()); } catch (error) { this.standaloneError.set(messageOf(error)); } finally { this.standaloneBusy.set(false); }
  }

  protected async applyStandalone(preview: AgentStandalonePreview): Promise<void> {
    const port = this.port;
    if (port === null) return;
    this.standaloneBusy.set(true);
    this.standaloneError.set(null);
    try {
      await port.standaloneApply(preview.confirmToken, preview.digest);
      this.standalone.set(null);
      await this.sync.reload();
    } catch (error) {
      this.standalone.set(null);
      this.standaloneError.set(messageOf(error));
    } finally {
      this.standaloneBusy.set(false);
    }
  }

  protected loadSyncedLayout(): void {
    const decoded = workspaceLayoutCodec.decode(this.remote.syncedLayout());
    if (decoded === null) {
      this.layoutError.set('The synced layout could not be read.');
      return;
    }
    this.layoutError.set(null);
    this.layout.applyLayout(decoded.panelTree, decoded.openTabs, decoded.preferenceOverrides);
    this.remote.dismissSyncedLayout();
  }

  protected dismissLayout(): void { this.remote.dismissSyncedLayout(); }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'That did not complete.';
}
