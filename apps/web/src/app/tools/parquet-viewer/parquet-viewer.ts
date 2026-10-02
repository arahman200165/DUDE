import { Component, computed, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { BinaryFormatViewer } from '../../shared/components/binary-format-viewer/binary-format-viewer';
import { BusyIndicatorStatus } from '../../shared/components/busy-indicator/busy-indicator';
import { decodeParquet, ParquetDecodeResult } from "@dude/tool-engine/tools/parquet-viewer/parquet-decode";

@Component({
  selector: 'app-parquet-viewer',
  imports: [ToolShell, BinaryFormatViewer],
  templateUrl: './parquet-viewer.html',
})
export class ParquetViewer {
  protected readonly fileName = signal<string | null>(null);
  protected readonly result = signal<ParquetDecodeResult | null>(null);
  protected readonly status = signal<BusyIndicatorStatus>('idle');

  protected readonly errorMessage = computed(() => {
    const current = this.result();
    return current && !current.ok ? current.error.message : null;
  });

  protected readonly tableColumns = computed(() => {
    const current = this.result();
    return current?.ok ? current.table.columns : null;
  });

  protected readonly tableRows = computed(() => {
    const current = this.result();
    return current?.ok ? current.table.rows : null;
  });

  protected async onFileSelected(file: File): Promise<void> {
    this.fileName.set(file.name);
    this.status.set('running');
    const buffer = await file.arrayBuffer();
    const result = await decodeParquet(new Uint8Array(buffer));
    this.result.set(result);
    this.status.set(result.ok ? 'done' : 'error');
  }

  protected onRejected(message: string): void {
    this.fileName.set(null);
    this.result.set({ ok: false, error: { message } });
    this.status.set('error');
  }
}
