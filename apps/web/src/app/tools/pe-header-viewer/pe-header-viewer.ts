import { Component, computed, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { BinaryFormatViewer } from '../../shared/components/binary-format-viewer/binary-format-viewer';
import { BusyIndicatorStatus } from '../../shared/components/busy-indicator/busy-indicator';
import { binaryValueToTree } from "@dude/tool-engine/shared/components/binary-format-viewer/binary-value-tree";
import { parsePeHeaders, PeParseError, PeReport } from "@dude/tool-engine/shared/pe/pe-parser";

@Component({
  selector: 'app-pe-header-viewer',
  imports: [ToolShell, BinaryFormatViewer],
  templateUrl: './pe-header-viewer.html',
})
export class PeHeaderViewer {
  protected readonly fileName = signal<string | null>(null);
  protected readonly result = signal<PeReport | PeParseError | null>(null);
  protected readonly status = signal<BusyIndicatorStatus>('idle');

  protected readonly errorMessage = computed(() => {
    const current = this.result();
    return current && !current.isPe ? current.error : null;
  });

  protected readonly treeNodes = computed(() => {
    const current = this.result();
    return current?.isPe ? binaryValueToTree(current, this.fileName() ?? 'PE headers') : null;
  });

  protected async onFileSelected(file: File): Promise<void> {
    this.fileName.set(file.name);
    this.status.set('running');
    const buffer = await file.arrayBuffer();
    const result = parsePeHeaders(new Uint8Array(buffer));
    this.result.set(result);
    this.status.set(result.isPe ? 'done' : 'error');
  }

  protected onRejected(message: string): void {
    this.fileName.set(null);
    this.result.set({ isPe: false, error: message });
    this.status.set('error');
  }
}
