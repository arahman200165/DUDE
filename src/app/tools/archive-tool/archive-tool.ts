import { Component, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { FileDrop } from '../../shared/components/file-drop/file-drop';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { FileDropHandoffService } from '../../core/file-drop-detect/file-drop-handoff.service';
import { downloadFile } from '../../shared/utils/download-file';
import { ARCHIVE_FORMATS, ArchiveEntry, ArchiveFormat, archiveFormatFromName } from './archive-tool-types';
import { createZip, extractZip } from './archive-tool-zip';
import { createTar, extractTar } from './archive-tool-tar';
import { createTarGz, extractTarGz } from './archive-tool-targz';

type Mode = 'create' | 'extract';

@Component({
  selector: 'app-archive-tool',
  imports: [ToolShell, ErrorPanel, FileDrop],
  templateUrl: './archive-tool.html',
})
export class ArchiveTool {
  private readonly persistence = inject(PersistenceService);

  protected readonly formats = Object.entries(ARCHIVE_FORMATS) as [ArchiveFormat, string][];

  protected readonly mode = this.persistence.signal<Mode>('archive-tool', 'mode', 'local', 'create');
  protected readonly format = this.persistence.signal<ArchiveFormat>('archive-tool', 'format', 'local', 'zip');

  protected readonly filesToArchive = signal<readonly File[]>([]);
  protected readonly archiveToExtract = signal<File | null>(null);
  protected readonly extractedEntries = signal<readonly ArchiveEntry[] | null>(null);

  protected readonly error = signal('');
  protected readonly running = signal(false);
  protected readonly resultBytes = signal<Uint8Array | null>(null);

  constructor() {
    // Smart File Drop hand-off: a handed-off file is always an archive to extract, so switch into
    // the mode that renders the extract-side `app-file-drop` (which consumes the file itself).
    if (inject(FileDropHandoffService).has('archive-tool')) this.mode.set('extract');
  }

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
    this.error.set('');
    this.resultBytes.set(null);
    this.extractedEntries.set(null);
  }

  protected onFormatChange(event: Event): void {
    this.format.set((event.target as HTMLSelectElement).value as ArchiveFormat);
  }

  protected onFilesToArchive(files: readonly File[]): void {
    this.filesToArchive.set(files);
    this.resultBytes.set(null);
    this.error.set('');
  }

  protected onArchiveFile(file: File): void {
    const format = archiveFormatFromName(file.name);
    if (format) this.format.set(format);
    this.archiveToExtract.set(file);
    this.extractedEntries.set(null);
    this.error.set('');
  }

  protected onRejected(message: string): void {
    this.error.set(message);
  }

  protected async createArchive(): Promise<void> {
    this.error.set('');
    this.resultBytes.set(null);

    const files = this.filesToArchive();
    if (files.length === 0) {
      this.error.set('Choose one or more files first.');
      return;
    }

    this.running.set(true);
    try {
      const entries: ArchiveEntry[] = await Promise.all(
        files.map(async (file) => ({ name: file.name, data: new Uint8Array(await file.arrayBuffer()) })),
      );

      if (this.format() === 'zip') {
        this.resultBytes.set(createZip(entries));
      } else if (this.format() === 'tar') {
        const result = createTar(entries);
        if (!result.ok) {
          this.error.set(result.error);
          return;
        }
        this.resultBytes.set(result.bytes);
      } else {
        const result = await createTarGz(entries);
        if (!result.ok) {
          this.error.set(result.error);
          return;
        }
        this.resultBytes.set(result.bytes);
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not build the archive.');
    } finally {
      this.running.set(false);
    }
  }

  protected async extractArchive(): Promise<void> {
    this.error.set('');
    this.extractedEntries.set(null);

    const file = this.archiveToExtract();
    if (!file) {
      this.error.set('Choose an archive file first.');
      return;
    }

    this.running.set(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const entries = this.format() === 'zip' ? extractZip(bytes) : this.format() === 'tar' ? extractTar(bytes) : await extractTarGz(bytes);
      this.extractedEntries.set(entries);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : `Could not extract this file as ${this.format()}.`);
    } finally {
      this.running.set(false);
    }
  }

  protected downloadArchive(): void {
    const bytes = this.resultBytes();
    if (!bytes) return;
    downloadFile(bytes, `archive.${this.format()}`);
  }

  protected downloadEntry(entry: ArchiveEntry): void {
    downloadFile(entry.data, entry.name.split('/').pop() ?? entry.name);
  }
}
