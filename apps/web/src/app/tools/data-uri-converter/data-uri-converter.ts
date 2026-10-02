import { Component, computed, effect, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { FileDrop } from '../../shared/components/file-drop/file-drop';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { downloadFile } from '../../shared/utils/download-file';
import { DataUriDecodeResult, decodeDataUri, generateDataUri } from "@dude/tool-engine/tools/data-uri-converter/data-uri-codec";

type Direction = 'generate' | 'decode';

@Component({
  selector: 'app-data-uri-converter',
  imports: [ToolShell, ErrorPanel, CopyButton, FileDrop],
  templateUrl: './data-uri-converter.html',
})
export class DataUriConverter {
  private readonly persistence = inject(PersistenceService);

  protected readonly direction = this.persistence.signal<Direction>('data-uri-converter', 'direction', 'local', 'generate');

  protected readonly text = this.persistence.signal('data-uri-converter', 'text', 'session', 'Hello, world!');
  protected readonly manualMimeType = this.persistence.signal('data-uri-converter', 'mimeType', 'local', 'text/plain');
  protected readonly downloadFilename = this.persistence.signal('data-uri-converter', 'filename', 'local', 'download.bin');
  protected readonly dataUriInput = this.persistence.signal('data-uri-converter', 'input', 'session', '');

  protected readonly selectedFile = signal<File | null>(null);
  protected readonly rejection = signal<string | null>(null);
  private readonly previewUrlSignal = signal<string | null>(null);
  protected readonly previewUrl = this.previewUrlSignal.asReadonly();

  private readonly fileBytes = signal<Uint8Array | null>(null);

  protected readonly generatedUri = computed(() => {
    const file = this.selectedFile();
    const bytes = this.fileBytes();
    if (file && bytes) return generateDataUri(bytes, file.type || 'application/octet-stream');
    return generateDataUri(new TextEncoder().encode(this.text()), this.manualMimeType() || 'text/plain');
  });

  protected readonly decodeResult = computed<DataUriDecodeResult | null>(() =>
    this.dataUriInput() === '' ? null : decodeDataUri(this.dataUriInput()),
  );

  constructor() {
    // Builds/revokes an Object URL for an image preview whenever the relevant source changes.
    effect((onCleanup) => {
      const decoded = this.decodeResult();
      const mime = this.direction() === 'generate' ? this.selectedFile()?.type : decoded?.ok ? decoded.mimeType : undefined;
      const bytes = this.direction() === 'generate' ? this.fileBytes() : decoded?.ok ? decoded.bytes : undefined;

      if (!mime?.startsWith('image/') || !bytes) {
        this.previewUrlSignal.set(null);
        return;
      }

      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime }));
      this.previewUrlSignal.set(url);
      onCleanup(() => URL.revokeObjectURL(url));
    });
  }

  protected setDirection(direction: Direction): void {
    this.direction.set(direction);
    this.rejection.set(null);
  }

  protected async onFileSelected(file: File): Promise<void> {
    this.rejection.set(null);
    this.selectedFile.set(file);
    this.fileBytes.set(new Uint8Array(await file.arrayBuffer()));
  }

  protected onRejected(message: string): void {
    this.rejection.set(message);
  }

  protected clearFile(): void {
    this.selectedFile.set(null);
    this.fileBytes.set(null);
  }

  protected onTextChange(event: Event): void {
    this.text.set((event.target as HTMLTextAreaElement).value);
  }

  protected onMimeTypeChange(event: Event): void {
    this.manualMimeType.set((event.target as HTMLInputElement).value);
  }

  protected onDataUriInputChange(event: Event): void {
    this.dataUriInput.set((event.target as HTMLTextAreaElement).value);
  }

  protected onFilenameChange(event: Event): void {
    this.downloadFilename.set((event.target as HTMLInputElement).value);
  }

  protected download(): void {
    const result = this.decodeResult();
    if (result?.ok) downloadFile(result.bytes, this.downloadFilename() || 'download.bin', result.mimeType);
  }

  protected clear(): void {
    this.text.set('');
    this.dataUriInput.set('');
    this.selectedFile.set(null);
    this.fileBytes.set(null);
    this.rejection.set(null);
  }
}
