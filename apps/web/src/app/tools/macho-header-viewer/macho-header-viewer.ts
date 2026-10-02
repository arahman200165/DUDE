import { Component, computed, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { BinaryFormatViewer } from '../../shared/components/binary-format-viewer/binary-format-viewer';
import { BusyIndicatorStatus } from '../../shared/components/busy-indicator/busy-indicator';
import { binaryValueToTree } from "@dude/tool-engine/shared/components/binary-format-viewer/binary-value-tree";
import { MachOParseError, MachOReport, parseMachOHeaders } from "@dude/tool-engine/tools/macho-header-viewer/macho-header-viewer-logic";

@Component({
  selector: 'app-macho-header-viewer',
  imports: [ToolShell, BinaryFormatViewer],
  templateUrl: './macho-header-viewer.html',
})
export class MachoHeaderViewer {
  protected readonly fileName = signal<string | null>(null);
  protected readonly result = signal<MachOReport | MachOParseError | null>(null);
  protected readonly status = signal<BusyIndicatorStatus>('idle');

  protected readonly errorMessage = computed(() => {
    const current = this.result();
    return current && !current.isMachO ? current.error : null;
  });

  protected readonly treeNodes = computed(() => {
    const current = this.result();
    return current?.isMachO ? binaryValueToTree(current, this.fileName() ?? 'Mach-O headers') : null;
  });

  protected async onFileSelected(file: File): Promise<void> {
    this.fileName.set(file.name);
    this.status.set('running');
    const buffer = await file.arrayBuffer();
    const result = parseMachOHeaders(new Uint8Array(buffer));
    this.result.set(result);
    this.status.set(result.isMachO ? 'done' : 'error');
  }

  protected onRejected(message: string): void {
    this.fileName.set(null);
    this.result.set({ isMachO: false, error: message });
    this.status.set('error');
  }
}
