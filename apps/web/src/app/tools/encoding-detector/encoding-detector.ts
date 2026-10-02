import { Component, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { FileDrop } from '../../shared/components/file-drop/file-drop';
import { detectEncoding, EncodingDetectionResult } from "@dude/tool-engine/shared/utils/encoding-detection";

interface EncodingReport extends EncodingDetectionResult {
  readonly fileName: string;
  readonly byteLength: number;
}

@Component({
  selector: 'app-encoding-detector',
  imports: [ToolShell, ErrorPanel, FileDrop],
  templateUrl: './encoding-detector.html',
})
export class EncodingDetector {
  protected readonly rejection = signal<string | null>(null);
  protected readonly report = signal<EncodingReport | null>(null);
  protected readonly loading = signal(false);

  protected async onFileSelected(file: File): Promise<void> {
    this.rejection.set(null);
    this.report.set(null);
    this.loading.set(true);

    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      this.report.set({ ...detectEncoding(bytes), fileName: file.name, byteLength: bytes.length });
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
