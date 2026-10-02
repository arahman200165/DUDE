import { Component, inject, signal } from '@angular/core';
import { formatBytes } from "@dude/tool-engine/shared/fs/format-size";
import { FsMutationService } from '../../core/platform/fs-mutation.service';
import { RememberedFoldersService } from '../../core/platform/remembered-folders.service';

const GIB = 1024 ** 3;

/**
 * Settings › Tools › Batch operations & folders (Phase 29, Milestone 524): undo-backup retention and
 * the remembered-folder grants. Forgetting a folder stops persisting its grant (and any background
 * watch on it) — it never touches the folder itself.
 */
@Component({
  selector: 'app-batch-operations-settings',
  template: `
    <div class="flex flex-col gap-4 text-ui">
      <section class="flex flex-col gap-2">
        <h3 class="font-semibold text-text">Undo backups</h3>
        <p class="text-text-muted">Before a batch operation overwrites a file, DUDE copies the original into its app data so the operation can be undone. Older backups are pruned first.</p>
        <div class="flex flex-wrap gap-3">
          <label data-setting class="flex flex-col gap-1 text-text-muted">Keep backups for (days)
            <input type="number" min="1" max="3650" class="w-28 rounded-sm border border-border bg-panel px-2 py-1 text-text" [value]="retentionDays()" (change)="setDays($event)" />
          </label>
          <label data-setting class="flex flex-col gap-1 text-text-muted">Backup cap (GiB)
            <input type="number" min="0" step="0.5" class="w-28 rounded-sm border border-border bg-panel px-2 py-1 text-text" [value]="capGib()" (change)="setCap($event)" />
          </label>
        </div>
        <span class="text-ui-xs text-text-muted">Currently using {{ bytes(usage()) }}.</span>
      </section>
      <section class="flex flex-col gap-2">
        <h3 class="font-semibold text-text">Remembered folders</h3>
        <p class="text-text-muted">Folders you asked DUDE to keep access to across restarts (only these can be watched in the background). Add one with "Remember this folder" in any folder picker.</p>
        @if (folders.folders().length) {
          <ul class="flex flex-col gap-1">
            @for (folder of folders.folders(); track folder.path) {
              <li class="flex items-center gap-2">
                <span class="font-mono text-text">{{ folder.path }}</span>
                @if (!folder.available) { <span class="text-ui-xs text-warning">missing</span> }
                <button type="button" class="ml-auto rounded-sm border border-border px-2 py-0.5 text-text" (click)="folders.forget(folder.path)">Forget</button>
              </li>
            }
          </ul>
        } @else { <span class="text-text-muted">None.</span> }
      </section>
      @if (error()) { <div role="alert" class="text-error">{{ error() }}</div> }
    </div>
  `,
})
export class BatchOperationsSettings {
  private readonly mutations = inject(FsMutationService);
  protected readonly folders = inject(RememberedFoldersService);
  protected readonly retentionDays = signal(30);
  protected readonly capGib = signal(5);
  protected readonly usage = signal(0);
  protected readonly error = signal('');
  protected readonly bytes = formatBytes;

  constructor() {
    if (!this.mutations.available) return;
    void this.folders.refresh();
    void this.mutations.settings().then((value) => {
      this.retentionDays.set(value.settings.retentionDays);
      this.capGib.set(Math.round((value.settings.maxBackupBytes / GIB) * 10) / 10);
      this.usage.set(value.backupBytes);
    }).catch((caught: unknown) => this.error.set(String(caught)));
  }

  protected async setDays(event: Event): Promise<void> {
    const saved = await this.mutations.setSettings({ retentionDays: Number((event.target as HTMLInputElement).value) });
    this.retentionDays.set(saved.retentionDays);
  }

  protected async setCap(event: Event): Promise<void> {
    const saved = await this.mutations.setSettings({ maxBackupBytes: Math.round(Number((event.target as HTMLInputElement).value) * GIB) });
    this.capGib.set(Math.round((saved.maxBackupBytes / GIB) * 10) / 10);
  }
}
