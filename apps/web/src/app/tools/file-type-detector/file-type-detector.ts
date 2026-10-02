import { Component, computed, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { FileDrop } from '../../shared/components/file-drop/file-drop';
import { detectFileType, FileTypeReport } from "@dude/tool-engine/tools/file-type-detector/file-type-detector-logic";

@Component({
  selector: 'app-file-type-detector',
  imports: [ToolShell, ErrorPanel, FileDrop],
  templateUrl: './file-type-detector.html',
})
export class FileTypeDetector {
  protected readonly rejection = signal<string | null>(null);
  protected readonly report = signal<FileTypeReport | null>(null);
  protected readonly loading = signal(false);

  protected readonly formattedSize = computed(() => {
    const bytes = this.report()?.fileSize;
    if (bytes === undefined) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  });

  protected async onFileSelected(file: File): Promise<void> {
    this.rejection.set(null);
    this.report.set(null);
    this.loading.set(true);

    try {
      const buffer = await file.arrayBuffer();
      this.report.set(detectFileType(new Uint8Array(buffer), file.name, file.type || null));
    } catch {
      this.rejection.set("Couldn't read this file.");
    } finally {
      this.loading.set(false);
    }
  }

  protected onRejected(message: string): void {
    this.rejection.set(message);
  }

  protected clear(): void {
    this.report.set(null);
    this.rejection.set(null);
  }
}
