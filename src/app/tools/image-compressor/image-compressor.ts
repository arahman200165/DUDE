import { Component, computed, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { FileDrop } from '../../shared/components/file-drop/file-drop';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { downloadFile } from '../../shared/utils/download-file';
import { computeSavingsPercent } from './image-compressor-savings';

export type CompressFormat = 'jpeg' | 'webp' | 'png';

const MIME_BY_FORMAT: Record<CompressFormat, string> = {
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  png: 'image/png',
};

/**
 * Plain canvas.toBlob() quality-based compression -- NOT the WASM-codec
 * (MozJPEG/WebP/PNG) approach the Phase 17 plan called for. @jsquash's
 * codecs locate their .wasm binary relative to their own module's
 * `import.meta.url` at runtime (a standard Emscripten `locateFile`
 * pattern); once Angular's esbuild-based production build bundles that
 * module into a chunk, that URL no longer points at a real file, and the
 * wasm never gets copied into `dist/` the way sql.js/pyodide's vendored
 * wasm does (those are pre-copied into `public/assets/vendor/` and located
 * via `document.baseURI`, which isn't even available inside this tool's
 * Worker). Fixing that would mean vendoring the wasm files as static
 * assets and threading a `locateFile` override through -- more than a
 * "fall back if this doesn't work cleanly" batch item calls for. Canvas's
 * own quality parameter gives real, if more modest, size reduction with
 * zero bundling risk.
 */
@Component({
  selector: 'app-image-compressor',
  imports: [ToolShell, ErrorPanel, FileDrop],
  templateUrl: './image-compressor.html',
})
export class ImageCompressor {
  private readonly persistence = inject(PersistenceService);

  protected readonly format = this.persistence.signal<CompressFormat>('image-compressor', 'format', 'local', 'webp');
  protected readonly quality = this.persistence.signal('image-compressor', 'quality', 'local', 75);

  protected readonly rejection = signal<string | null>(null);
  protected readonly selectedFile = signal<File | null>(null);
  protected readonly originalSize = signal(0);

  protected readonly resultUrl = signal<string | null>(null);
  protected readonly resultSize = signal(0);
  protected readonly resultFilename = signal<string | null>(null);

  protected readonly savingsPercent = computed(() => computeSavingsPercent(this.originalSize(), this.resultSize()));

  protected onFileSelected(file: File): void {
    this.rejection.set(null);
    this.selectedFile.set(file);
    this.originalSize.set(file.size);

    const previousUrl = this.resultUrl();
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    this.resultUrl.set(null);
    this.resultSize.set(0);
  }

  protected async compress(): Promise<void> {
    const file = this.selectedFile();
    if (!file) return;
    this.rejection.set(null);

    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable.');
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();

      const mime = MIME_BY_FORMAT[this.format()];
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, mime, this.quality() / 100));
      if (!blob) throw new Error('Failed to encode compressed image.');

      const previousUrl = this.resultUrl();
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      this.resultUrl.set(URL.createObjectURL(blob));
      this.resultSize.set(blob.size);
      const extension = this.format() === 'jpeg' ? 'jpg' : this.format();
      this.resultFilename.set(file.name.replace(/\.\w+$/, '') + `-compressed.${extension}`);
    } catch {
      this.rejection.set("Couldn't compress this image.");
    }
  }

  protected download(): void {
    const url = this.resultUrl();
    const filename = this.resultFilename();
    if (!url || !filename) return;
    fetch(url)
      .then((response) => response.blob())
      .then((blob) => blob.arrayBuffer())
      .then((buffer) => downloadFile(new Uint8Array(buffer), filename));
  }

  protected onRejected(message: string): void {
    this.rejection.set(message);
  }
}
