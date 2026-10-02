import { Component, computed, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { BinaryFormatViewer } from '../../shared/components/binary-format-viewer/binary-format-viewer';
import { BusyIndicatorStatus } from '../../shared/components/busy-indicator/busy-indicator';
import { binaryValueToTree } from "@dude/tool-engine/shared/components/binary-format-viewer/binary-value-tree";
import { ElfParseError, ElfReport, parseElfHeaders } from "@dude/tool-engine/tools/elf-header-viewer/elf-header-viewer-logic";

@Component({
  selector: 'app-elf-header-viewer',
  imports: [ToolShell, BinaryFormatViewer],
  templateUrl: './elf-header-viewer.html',
})
export class ElfHeaderViewer {
  protected readonly fileName = signal<string | null>(null);
  protected readonly result = signal<ElfReport | ElfParseError | null>(null);
  protected readonly status = signal<BusyIndicatorStatus>('idle');

  protected readonly errorMessage = computed(() => {
    const current = this.result();
    return current && !current.isElf ? current.error : null;
  });

  protected readonly treeNodes = computed(() => {
    const current = this.result();
    return current?.isElf ? binaryValueToTree(current, this.fileName() ?? 'ELF headers') : null;
  });

  protected async onFileSelected(file: File): Promise<void> {
    this.fileName.set(file.name);
    this.status.set('running');
    const buffer = await file.arrayBuffer();
    const result = parseElfHeaders(new Uint8Array(buffer));
    this.result.set(result);
    this.status.set(result.isElf ? 'done' : 'error');
  }

  protected onRejected(message: string): void {
    this.fileName.set(null);
    this.result.set({ isElf: false, error: message });
    this.status.set('error');
  }
}
