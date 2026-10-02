import { Component, inject, signal } from '@angular/core';
import { SystemMutationService } from '../../core/platform/system-mutation.service';
import { SystemSnapshotService } from '../../core/platform/system-snapshot.service';
import { formatBytes } from "@dude/tool-engine/tools/system-changes/system-changes-logic";

const MIB = 1024 ** 2;

/**
 * Settings › Tools › System changes & snapshots (Phase 31, Milestone 594): retention for the undo
 * backups the system mutation engine keeps (registry exports, prior values) and snapshot storage use.
 */
@Component({
  selector: 'app-system-changes-settings',
  template: `
    <div class="flex flex-col gap-4 text-ui">
      <section class="flex flex-col gap-2">
        <h3 class="font-semibold text-text">Undo backups</h3>
        <p class="text-text-muted">Before a system change, DUDE keeps what is needed to undo it (for example the prior registry value). Older backups are pruned first.</p>
        <div class="flex flex-wrap gap-3">
          <label data-setting class="flex flex-col gap-1 text-text-muted">Keep backups for (days)
            <input type="number" min="1" max="3650" class="w-28 rounded-sm border border-border bg-panel px-2 py-1 text-text" data-testid="sys-retention-days" [value]="retentionDays()" (change)="setDays($event)" />
          </label>
          <label data-setting class="flex flex-col gap-1 text-text-muted">Backup cap (MB)
            <input type="number" min="0" step="10" class="w-28 rounded-sm border border-border bg-panel px-2 py-1 text-text" data-testid="sys-max-backup-mb" [value]="capMb()" (change)="setCap($event)" />
          </label>
        </div>
        <span class="text-ui-xs text-text-muted">Backups currently use {{ bytes(backupBytes()) }}.</span>
      </section>
      <section class="flex flex-col gap-1">
        <h3 class="font-semibold text-text">Snapshot library</h3>
        <span class="text-text-muted">{{ snapshotCount() }} snapshot(s), {{ bytes(snapshotBytes()) }}. Manage them in System Changes.</span>
      </section>
      @if (error()) { <div role="alert" class="text-error">{{ error() }}</div> }
    </div>
  `,
})
export class SystemChangesSettings {
  private readonly mutations = inject(SystemMutationService);
  private readonly snapshots = inject(SystemSnapshotService);
  protected readonly retentionDays = signal(30);
  protected readonly capMb = signal(500);
  protected readonly backupBytes = signal(0);
  protected readonly snapshotCount = signal(0);
  protected readonly snapshotBytes = signal(0);
  protected readonly error = signal('');
  protected readonly bytes = formatBytes;

  constructor() {
    if (this.mutations.available) {
      void this.mutations.getSettings().then((value) => {
        this.retentionDays.set(value.settings.retentionDays);
        this.capMb.set(Math.round(value.settings.maxBackupBytes / MIB));
        this.backupBytes.set(value.backupBytes);
      }).catch((caught: unknown) => this.error.set(String(caught)));
    }
    if (this.snapshots.available) {
      void this.snapshots.usage().then((usage) => {
        this.snapshotCount.set(usage.count);
        this.snapshotBytes.set(usage.bytes);
      }).catch((caught: unknown) => this.error.set(String(caught)));
    }
  }

  protected async setDays(event: Event): Promise<void> {
    try {
      const saved = await this.mutations.setSettings({ retentionDays: Number((event.target as HTMLInputElement).value) });
      this.retentionDays.set(saved.retentionDays);
    } catch (caught) { this.error.set(caught instanceof Error ? caught.message : String(caught)); }
  }

  protected async setCap(event: Event): Promise<void> {
    try {
      const saved = await this.mutations.setSettings({ maxBackupBytes: Math.round(Number((event.target as HTMLInputElement).value) * MIB) });
      this.capMb.set(Math.round(saved.maxBackupBytes / MIB));
    } catch (caught) { this.error.set(caught instanceof Error ? caught.message : String(caught)); }
  }
}
