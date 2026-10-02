import { BatchOperationsTool_when } from "@dude/tool-engine/tools/batch-operations/batch-operations.embedded-engine";
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ApplyResult, JournalEntry, PlanPreview } from "@dude/contracts/fs/fs-types";
import { formatBytes } from "@dude/tool-engine/shared/fs/format-size";
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { MutationPreview } from '../../shared/components/mutation-preview/mutation-preview';
import { PlatformService } from '../../core/platform/platform.service';
import { FsMutationService } from '../../core/platform/fs-mutation.service';
import { describeOp, filterJournal, summarizeEntry } from "@dude/tool-engine/tools/batch-operations/batch-operations-logic";

/**
 * Batch Operations (DUDE_PRD.md §21 Phase 29 item 20, Milestone 524): the journal of everything the
 * mutation engine applied, with per-file outcomes, previewed undo, and backup storage. Undo is not a
 * shortcut around the Destructive-Action Contract: it builds an inverse plan that goes through the
 * same MutationPreview review → confirm steps as the original change.
 */
@Component({
  selector: 'app-batch-operations',
  imports: [ToolShell, DesktopOnlyControl, MutationPreview, RouterLink],
  templateUrl: './batch-operations.html',
})
export class BatchOperationsTool {
  protected readonly platform = inject(PlatformService);
  private readonly mutations = inject(FsMutationService);

  protected readonly entries = signal<readonly JournalEntry[]>([]);
  protected readonly query = signal('');
  protected readonly expanded = signal<string | null>(null);
  protected readonly preview = signal<PlanPreview | null>(null);
  protected readonly backupBytes = signal(0);
  protected readonly maxBackupBytes = signal(0);
  protected readonly retentionDays = signal(0);
  protected readonly confirmingPurge = signal(false);
  protected readonly error = signal('');
  protected readonly bytes = formatBytes;
  protected readonly describe = describeOp;

  protected readonly visible = computed(() => filterJournal(this.entries(), this.query()).map((entry) => ({ entry, summary: summarizeEntry(entry) })));

  constructor() {
    if (this.platform.isDesktop()) void this.reload();
  }

  protected async reload(): Promise<void> {
    try {
      this.entries.set(await this.mutations.journal());
      const storage = await this.mutations.settings();
      this.backupBytes.set(storage.backupBytes);
      this.maxBackupBytes.set(storage.settings.maxBackupBytes);
      this.retentionDays.set(storage.settings.retentionDays);
    } catch (caught) { this.error.set(caught instanceof Error ? caught.message : String(caught)); }
  }

  protected toggle(planId: string): void { this.expanded.update((current) => (current === planId ? null : planId)); }

  /** Step 1 only: builds the inverse plan for review. Nothing changes until MutationPreview's confirm. */
  protected async previewUndo(planId: string): Promise<void> {
    this.error.set('');
    try { this.preview.set(await this.mutations.planUndo(planId)); }
    catch (caught) { this.error.set(caught instanceof Error ? caught.message : String(caught)); }
  }

  protected async onApplied(_result: ApplyResult): Promise<void> { await this.reload(); }

  protected async purge(): Promise<void> {
    await this.mutations.purgeBackups();
    this.confirmingPurge.set(false);
    await this.reload();
  }
  protected when = BatchOperationsTool_when;

}
