import { Component, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { FileDrop } from '../../shared/components/file-drop/file-drop';
import { downloadFile } from '../../shared/utils/download-file';
import { BomInfo, detectBom, stripBom } from "@dude/tool-engine/shared/utils/encoding-detection";

interface BomReport {
  readonly fileName: string;
  readonly byteLength: number;
  readonly bom: BomInfo | null;
  readonly bytes: Uint8Array;
}

@Component({
  selector: 'app-bom-detector',
  imports: [ToolShell, ErrorPanel, FileDrop],
  templateUrl: './bom-detector.html',
})
export class BomDetector {
  protected readonly rejection = signal<string | null>(null);
  protected readonly report = signal<BomReport | null>(null);
  protected readonly loading = signal(false);

  protected async onFileSelected(file: File): Promise<void> {
    this.rejection.set(null);
    this.report.set(null);
    this.loading.set(true);

    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      this.report.set({ fileName: file.name, byteLength: bytes.length, bom: detectBom(bytes), bytes });
    } catch {
      this.rejection.set("Couldn't read this file.");
    } finally {
      this.loading.set(false);
    }
  }

  protected onRejected(message: string): void {
    this.rejection.set(message);
  }

  protected downloadWithoutBom(): void {
    const data = this.report();
    if (!data?.bom) return;
    downloadFile(stripBom(data.bytes), data.fileName);
  }

  protected clear(): void {
    this.report.set(null);
    this.rejection.set(null);
  }
}
