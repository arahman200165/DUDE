import { Component, computed, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { FileDrop } from '../../shared/components/file-drop/file-drop';
import { DataTable } from '../../shared/components/data-table/data-table';
import { SimpleColumnsPipe } from '../../shared/components/data-table/simple-columns.pipe';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { parseLockfile, parseLockfileAs } from './lockfile-inspector-parse';
import { LockfileFormat, NormalizedPackage } from './lockfile-inspector-types';

type Mode = 'upload' | 'paste';

const FORMAT_LABELS: Record<LockfileFormat, string> = {
  npm: 'npm (package-lock.json)',
  pnpm: 'pnpm (pnpm-lock.yaml)',
  'yarn-classic': 'yarn classic (yarn.lock v1)',
  'yarn-berry': 'yarn berry (yarn.lock v2+)',
};

@Component({
  selector: 'app-lockfile-inspector',
  imports: [ToolShell, ErrorPanel, FileDrop, DataTable, SimpleColumnsPipe],
  templateUrl: './lockfile-inspector.html',
})
export class LockfileInspector {
  private readonly persistence = inject(PersistenceService);

  protected readonly formatOptions = Object.entries(FORMAT_LABELS) as [LockfileFormat, string][];

  protected readonly mode = this.persistence.signal<Mode>('lockfile-inspector', 'mode', 'local', 'upload');
  protected readonly pasteFormat = this.persistence.signal<LockfileFormat>('lockfile-inspector', 'pasteFormat', 'local', 'npm');
  protected readonly pasteContent = signal('');
  protected readonly filterText = this.persistence.signal('lockfile-inspector', 'filterText', 'local', '');

  private readonly uploadedFile = signal<{ name: string; content: string } | null>(null);
  protected readonly error = signal('');

  protected readonly parseResult = computed(() => {
    if (this.mode() === 'upload') {
      const file = this.uploadedFile();
      return file ? parseLockfile(file.name, file.content) : null;
    }
    return this.pasteContent().trim() === '' ? null : parseLockfileAs(this.pasteFormat(), this.pasteContent());
  });

  protected readonly filteredPackages = computed<readonly NormalizedPackage[]>(() => {
    const result = this.parseResult();
    if (!result?.ok) return [];
    const normalized = this.filterText().trim().toLowerCase();
    if (normalized === '') return result.packages;
    return result.packages.filter((pkg) => pkg.name.toLowerCase().includes(normalized) || pkg.version.toLowerCase().includes(normalized));
  });

  protected readonly rows = computed(() =>
    this.filteredPackages()
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((pkg) => [pkg.name, pkg.version, pkg.dependencies.length.toString(), pkg.resolved ?? '']),
  );

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
    this.error.set('');
  }

  protected onPasteFormatChange(event: Event): void {
    this.pasteFormat.set((event.target as HTMLSelectElement).value as LockfileFormat);
  }

  protected onPasteContentChange(event: Event): void {
    this.pasteContent.set((event.target as HTMLTextAreaElement).value);
  }

  protected async onFileSelected(file: File): Promise<void> {
    this.error.set('');
    try {
      this.uploadedFile.set({ name: file.name, content: await file.text() });
    } catch {
      this.error.set(`Could not read "${file.name}" as text.`);
    }
  }

  protected onFileRejected(message: string): void {
    this.error.set(message);
  }

  protected onFilterInput(event: Event): void {
    this.filterText.set((event.target as HTMLInputElement).value);
  }
}
