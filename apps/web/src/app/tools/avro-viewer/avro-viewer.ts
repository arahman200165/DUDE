import { Component, computed, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { BinaryFormatViewer } from '../../shared/components/binary-format-viewer/binary-format-viewer';
import { BusyIndicatorStatus } from '../../shared/components/busy-indicator/busy-indicator';
import { binaryValueToTree } from "@dude/tool-engine/shared/components/binary-format-viewer/binary-value-tree";
import { decodeAvroContainer, AvroDecodeResult } from "@dude/tool-engine/tools/avro-viewer/avro-decode";

@Component({
  selector: 'app-avro-viewer',
  imports: [ToolShell, BinaryFormatViewer],
  templateUrl: './avro-viewer.html',
})
export class AvroViewer {
  protected readonly fileName = signal<string | null>(null);
  protected readonly result = signal<AvroDecodeResult | null>(null);
  protected readonly status = signal<BusyIndicatorStatus>('idle');

  protected readonly errorMessage = computed(() => {
    const current = this.result();
    return current && !current.ok ? current.error.message : null;
  });

  protected readonly treeNodes = computed(() => {
    const current = this.result();
    if (!current?.ok) return null;
    const label = `${this.fileName() ?? 'root'} (${current.records.length} record${current.records.length === 1 ? '' : 's'})`;
    return binaryValueToTree(current.records, label);
  });

  protected async onFileSelected(file: File): Promise<void> {
    this.fileName.set(file.name);
    this.status.set('running');
    const buffer = await file.arrayBuffer();
    const result = decodeAvroContainer(new Uint8Array(buffer));
    this.result.set(result);
    this.status.set(result.ok ? 'done' : 'error');
  }

  protected onRejected(message: string): void {
    this.fileName.set(null);
    this.result.set({ ok: false, error: { message } });
    this.status.set('error');
  }
}
