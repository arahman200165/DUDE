import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { SysApplyResult, SysJournalEntry, SysOpOutcome, SysPlanPreview, SysSnapshotHeader } from '../../../shared-logic/system/sys-mutation-types';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { SystemChangePreview } from '../../shared/components/system-change-preview/system-change-preview';
import { StatusGlyph } from '../../shared/components/status-glyph/status-glyph';
import { downloadFile } from '../../shared/utils/download-file';
import { PlatformService } from '../../core/platform/platform.service';
import { SystemMutationService } from '../../core/platform/system-mutation.service';
import { SystemSnapshotService } from '../../core/platform/system-snapshot.service';
import { countOutcomes, distinctTools, filterJournal, formatBytes, groupSnapshots, isUndoable, snapshotFileName, undoNote } from './system-changes-logic';

/**
 * System Changes (DUDE_PRD.md §21 Phase 31, Milestone 594): the journal of everything the system
 * mutation engine applied, previewed undo, backup storage, and the snapshot library. Undo is not a
 * shortcut around the Destructive-Action Contract: it builds an inverse plan that goes through the
 * same SystemChangePreview review → confirm steps as the original change.
 */
@Component({
  selector: 'app-system-changes',
  imports: [ToolShell, DesktopOnlyControl, SystemChangePreview, StatusGlyph, RouterLink],
  templateUrl: './system-changes.html',
})
export class SystemChangesTool {
  protected readonly platform = inject(PlatformService);
  private readonly mutations = inject(SystemMutationService);
  private readonly snapshots = inject(SystemSnapshotService);

  protected readonly entries = signal<readonly SysJournalEntry[]>([]);
  protected readonly toolFilter = signal('');
  protected readonly outcomeFilter = signal<SysOpOutcome | ''>('');
  protected readonly query = signal('');
  protected readonly expanded = signal<string | null>(null);
  protected readonly preview = signal<SysPlanPreview | null>(null);
  protected readonly backupBytes = signal(0);
  protected readonly confirmingPurge = signal(false);
  protected readonly snapshotHeaders = signal<readonly SysSnapshotHeader[]>([]);
  protected readonly snapshotBytes = signal(0);
  protected readonly error = signal('');
  protected readonly bytes = formatBytes;
  protected readonly outcomes: readonly SysOpOutcome[] = ['applied', 'conflict', 'failed', 'cancelled'];

  protected readonly tools = computed(() => distinctTools(this.entries()));
  protected readonly visible = computed(() =>
    filterJournal(this.entries(), { tool: this.toolFilter(), outcome: this.outcomeFilter(), query: this.query() })
      .map((entry) => ({ entry, counts: countOutcomes(entry), undoable: isUndoable(entry), note: undoNote(entry) })));
  protected readonly snapshotGroups = computed(() => groupSnapshots(this.snapshotHeaders()));

  constructor() {
    if (this.platform.isDesktop()) void this.reload();
  }

  protected async reload(): Promise<void> {
    this.error.set('');
    try {
      this.entries.set(await this.mutations.journal());
      this.backupBytes.set((await this.mutations.getSettings()).backupBytes);
      await this.reloadSnapshots();
    } catch (caught) { this.fail(caught); }
  }

  private async reloadSnapshots(): Promise<void> {
    if (!this.snapshots.available) return;
    this.snapshotHeaders.set(await this.snapshots.list());
    this.snapshotBytes.set((await this.snapshots.usage()).bytes);
  }

  private fail(caught: unknown): void { this.error.set(caught instanceof Error ? caught.message : String(caught)); }

  protected toggle(planId: string): void { this.expanded.update((current) => (current === planId ? null : planId)); }
  protected when(iso: string): string { return iso.slice(0, 16).replace('T', ' '); }

  /** Step 1 only: builds the inverse plan for review. Nothing changes until SystemChangePreview's confirm. */
  protected async previewUndo(planId: string): Promise<void> {
    this.error.set('');
    try { this.preview.set(await this.mutations.planUndo(planId)); }
    catch (caught) { this.fail(caught); }
  }

  protected async onApplied(_result: SysApplyResult): Promise<void> { await this.reload(); }

  protected async purge(): Promise<void> {
    try {
      await this.mutations.purgeBackups();
      this.confirmingPurge.set(false);
      await this.reload();
    } catch (caught) { this.fail(caught); }
  }

  protected async removeSnapshot(header: SysSnapshotHeader): Promise<void> {
    try { await this.snapshots.remove(header.kind, header.id); await this.reloadSnapshots(); }
    catch (caught) { this.fail(caught); }
  }

  protected async exportSnapshot(header: SysSnapshotHeader): Promise<void> {
    try {
      const json = await this.snapshots.exportJson(header.kind, header.id);
      downloadFile(new Blob([json], { type: 'application/json' }), snapshotFileName(header), 'application/json');
    } catch (caught) { this.fail(caught); }
  }

  protected async importSnapshot(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.error.set('');
    try {
      await this.snapshots.importJson(await file.text());
      await this.reloadSnapshots();
    } catch (caught) { this.fail(caught); }
  }

  protected setOutcome(value: string): void { this.outcomeFilter.set(value as SysOpOutcome | ''); }

  protected glyph(outcome: SysOpOutcome): 'success' | 'warning' | 'error' | 'cancelled' {
    return outcome === 'applied' ? 'success' : outcome === 'failed' ? 'error' : outcome === 'cancelled' ? 'cancelled' : 'warning';
  }
}
