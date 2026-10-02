import { Component, inject, signal } from '@angular/core';
import { ClearAllDataService } from '../../../core/workspace/clear-all-data';
import { DudeBundleService } from '../../../core/backup/dude-bundle.service';
import { ConflictMode, ImportPlan } from "@dude/domain/core/backup/dude-bundle.model";
import { downloadFile } from '../../../shared/utils/download-file';

interface SaveFilePickerWindow {
  showSaveFilePicker?(options: { suggestedName: string }): Promise<{
    createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
  }>;
}

/**
 * Settings › Data & Privacy. The one home of "Clear all local data", and of the export/import
 * bundle (Phase 26 Item 14): a portable backup of projects, templates, pipelines, scripts, and tool
 * preferences, identical on web and desktop.
 *
 * Import is two-step: choosing a file only builds a preview (counts, conflicts, a code-execution
 * notice for scripts). Nothing is written until the explicit "Import" confirm.
 */
@Component({
  selector: 'app-data-privacy-settings',
  templateUrl: './data-privacy-settings.html',
})
export class DataPrivacySettings {
  private readonly clearAllData = inject(ClearAllDataService);
  private readonly bundles = inject(DudeBundleService);
  protected readonly status = signal<'idle' | 'cleared'>('idle');

  protected readonly includeInputs = signal(false);
  protected readonly conflictMode = signal<ConflictMode>('skip');
  protected readonly importText = signal<string | null>(null);
  protected readonly importPlan = signal<ImportPlan | null>(null);
  protected readonly bundleMessage = signal<string | null>(null);

  protected async onClearAllLocalData(): Promise<void> {
    if (!confirm('Clear all saved DUDE data from this browser? This cannot be undone.')) return;
    await this.clearAllData.clearAll();
    this.status.set('cleared');
  }

  protected async exportBundle(): Promise<void> {
    const bundle = this.bundles.build({ includeInputs: this.includeInputs() });
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const name = `dude-bundle-${new Date().toISOString().slice(0, 10)}.json`;
    const picker = (window as SaveFilePickerWindow).showSaveFilePicker;
    try {
      if (picker) {
        const handle = await picker.call(window, { suggestedName: name });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        downloadFile(blob, name, 'application/json');
      }
      this.bundleMessage.set(
        `Exported ${bundle.projects.length} project(s), ${bundle.pipelines.length} pipeline(s), ${bundle.userScripts.length} script(s).`,
      );
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) this.bundleMessage.set('Export failed. Try again.');
    }
  }

  protected async onImportFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.importText.set(await file.text());
    this.preview();
  }

  protected onConflictModeChange(event: Event): void {
    this.conflictMode.set((event.target as HTMLSelectElement).value as ConflictMode);
    this.preview();
  }

  protected async confirmImport(): Promise<void> {
    const plan = this.importPlan();
    if (!plan) return;
    const result = await this.bundles.apply(plan);
    this.cancelImport();
    if (!result.ok) {
      this.bundleMessage.set(`Import finished with errors: ${result.errors.join('; ')}`);
      return;
    }
    this.bundleMessage.set(
      plan.userScripts.items.length
        ? 'Imported. Imported scripts need a review under Pipelines › Scripts before they can run.'
        : 'Imported.',
    );
  }

  protected cancelImport(): void {
    this.importText.set(null);
    this.importPlan.set(null);
  }

  protected toolCount(record: Readonly<Record<string, unknown>>): number {
    return Object.keys(record).length;
  }

  protected conflictSummary(plan: ImportPlan): { skipped: number; replaced: number } {
    const sections = [plan.projects, plan.workspaceTemplates, plan.pipelines, plan.userScripts, plan.homeLayout, plan.appearance];
    return {
      skipped: sections.reduce((total, section) => total + section.skipped, 0),
      replaced: sections.reduce((total, section) => total + section.replaced, 0),
    };
  }

  private preview(): void {
    const text = this.importText();
    if (text === null) return;
    const result = this.bundles.preview(text, this.conflictMode());
    this.bundleMessage.set(result.ok ? null : result.error);
    this.importPlan.set(result.ok ? result.plan : null);
  }
}
