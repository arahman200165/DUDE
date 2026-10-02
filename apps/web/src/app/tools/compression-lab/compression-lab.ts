import { CompressionLab_formatBytes } from "@dude/tool-engine/tools/compression-lab/compression-lab.embedded-engine";
import { Component, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { FileDrop } from '../../shared/components/file-drop/file-drop';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { downloadFile } from '../../shared/utils/download-file';
import { compressBytes, COMPRESSION_FORMATS, CompressionFormat, CompressionStats, computeStats, decompressBytes } from "@dude/tool-engine/tools/compression-lab/compression-lab-transform";

type Direction = 'compress' | 'decompress';
type InputMode = 'text' | 'file';

interface RunResult {
  readonly bytes: Uint8Array;
  readonly stats: CompressionStats;
}

@Component({
  selector: 'app-compression-lab',
  imports: [ToolShell, ErrorPanel, FileDrop],
  templateUrl: './compression-lab.html',
})
export class CompressionLab {
  private readonly persistence = inject(PersistenceService);

  protected readonly formats = Object.entries(COMPRESSION_FORMATS) as [CompressionFormat, string][];

  protected readonly inputMode = this.persistence.signal<InputMode>('compression-lab', 'inputMode', 'local', 'text');
  protected readonly direction = this.persistence.signal<Direction>('compression-lab', 'direction', 'local', 'compress');
  protected readonly format = this.persistence.signal<CompressionFormat>('compression-lab', 'format', 'local', 'gzip');
  protected readonly text = this.persistence.signal('compression-lab', 'text', 'session', 'The quick brown fox jumps over the lazy dog. '.repeat(10));

  protected readonly selectedFile = signal<File | null>(null);
  protected readonly result = signal<RunResult | null>(null);
  protected readonly error = signal('');
  protected readonly running = signal(false);

  protected onInputModeChange(mode: InputMode): void {
    this.inputMode.set(mode);
    this.result.set(null);
    this.error.set('');
  }

  protected onDirectionChange(direction: Direction): void {
    this.direction.set(direction);
    this.result.set(null);
  }

  protected onFormatChange(event: Event): void {
    this.format.set((event.target as HTMLSelectElement).value as CompressionFormat);
    this.result.set(null);
  }

  protected onTextInput(event: Event): void {
    this.text.set((event.target as HTMLTextAreaElement).value);
  }

  protected onFileSelected(file: File): void {
    this.selectedFile.set(file);
    this.result.set(null);
    this.error.set('');
  }

  protected onFileRejected(message: string): void {
    this.error.set(message);
  }

  protected async run(): Promise<void> {
    this.error.set('');
    this.result.set(null);

    let inputBytes: Uint8Array;
    if (this.inputMode() === 'text') {
      inputBytes = new TextEncoder().encode(this.text());
    } else {
      const file = this.selectedFile();
      if (!file) {
        this.error.set('Choose a file first.');
        return;
      }
      inputBytes = new Uint8Array(await file.arrayBuffer());
    }

    this.running.set(true);
    try {
      const outputBytes =
        this.direction() === 'compress' ? await compressBytes(inputBytes, this.format()) : await decompressBytes(inputBytes, this.format());
      this.result.set({ bytes: outputBytes, stats: computeStats(inputBytes.length, outputBytes.length) });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : `Could not ${this.direction()} this input as ${this.format()}.`);
    } finally {
      this.running.set(false);
    }
  }

  protected download(): void {
    const current = this.result();
    if (!current) return;
    const suffix = this.direction() === 'compress' ? `.${this.format() === 'gzip' ? 'gz' : 'deflate'}` : '.out';
    downloadFile(current.bytes, `output${suffix}`);
  }
  protected formatBytes = CompressionLab_formatBytes;

}
