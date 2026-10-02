import { HexEditor_charFor, HexEditor_offsetHex } from "@dude/tool-engine/tools/hex-editor/hex-editor.embedded-engine";
import { Component, computed, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { FileDrop } from '../../shared/components/file-drop/file-drop';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { downloadFile } from '../../shared/utils/download-file';
import { chunkIntoRows, formatHexByte, isPrintableAsciiByte, parseHexByte, setByteAt } from "@dude/tool-engine/tools/hex-editor/hex-editor-logic";

/** Keeps the DOM grid to a manageable size -- this is an interactive per-byte editor, not a bulk viewer (see Hex Dump Viewer/Builder for large files). */
const MAX_EDITABLE_BYTES = 16 * 1024;

@Component({
  selector: 'app-hex-editor',
  imports: [ToolShell, ErrorPanel, FileDrop],
  templateUrl: './hex-editor.html',
})
export class HexEditor {
  private readonly persistence = inject(PersistenceService);

  protected readonly bytesPerRow = this.persistence.signal('hex-editor', 'bytes-per-row', 'local', 16);

  protected readonly fileName = signal<string | null>(null);
  protected readonly rejection = signal<string | null>(null);
  protected readonly bytes = signal<Uint8Array | null>(null);
  protected readonly dirty = signal(false);

  protected readonly editingIndex = signal<number | null>(null);
  protected readonly editingValue = signal('');

  protected readonly rows = computed(() => {
    const bytes = this.bytes();
    return bytes ? chunkIntoRows(bytes, Math.max(1, this.bytesPerRow())) : [];
  });

  protected async onFileSelected(file: File): Promise<void> {
    this.rejection.set(null);
    this.bytes.set(null);
    this.dirty.set(false);
    this.editingIndex.set(null);

    const buffer = await file.arrayBuffer();
    if (buffer.byteLength > MAX_EDITABLE_BYTES) {
      this.rejection.set(`This interactive editor is limited to ${MAX_EDITABLE_BYTES / 1024} KB files to keep editing responsive.`);
      return;
    }

    this.fileName.set(file.name);
    this.bytes.set(new Uint8Array(buffer));
  }

  protected onRejected(message: string): void {
    this.rejection.set(message);
  }

  protected startEdit(index: number, currentByte: number): void {
    this.editingIndex.set(index);
    this.editingValue.set(formatHexByte(currentByte));
  }

  protected onEditingInput(event: Event): void {
    this.editingValue.set((event.target as HTMLInputElement).value);
  }

  protected commitEdit(index: number): void {
    const value = parseHexByte(this.editingValue());
    const bytes = this.bytes();
    if (value !== null && bytes) {
      this.bytes.set(setByteAt(bytes, index, value));
      this.dirty.set(true);
    }
    this.editingIndex.set(null);
  }

  protected cancelEdit(): void {
    this.editingIndex.set(null);
  }

  protected readonly hexByte = formatHexByte;
  protected charFor = HexEditor_charFor;

  protected offsetHex = HexEditor_offsetHex;


  protected download(): void {
    const bytes = this.bytes();
    if (bytes) downloadFile(bytes, this.fileName() || 'edited.bin');
  }

  protected clear(): void {
    this.bytes.set(null);
    this.fileName.set(null);
    this.rejection.set(null);
    this.dirty.set(false);
    this.editingIndex.set(null);
  }
}
