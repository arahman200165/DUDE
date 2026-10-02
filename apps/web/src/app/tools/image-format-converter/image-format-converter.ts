import { Component, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { FileDrop } from '../../shared/components/file-drop/file-drop';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { downloadFile } from '../../shared/utils/download-file';
import { ImageOutputFormat, replaceExtension } from "@dude/tool-engine/tools/image-format-converter/format-mime";
import { PreviewBackground } from "@dude/tool-engine/shared/components/preview-background/preview-background-style";
import { PreviewBackgroundChips, PreviewBackgroundTarget } from '../../shared/components/preview-background/preview-background';

/** Cached across calls -- the capability doesn't change within a session. */
let avifSupportPromise: Promise<boolean> | null = null;

/** Feature-detects AVIF *encode* support by attempting a real canvas.toBlob() call. */
function detectAvifSupport(): Promise<boolean> {
  if (avifSupportPromise) return avifSupportPromise;
  avifSupportPromise = new Promise<boolean>((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    canvas.getContext('2d');
    canvas.toBlob((blob) => resolve(!!blob && blob.type === 'image/avif'), 'image/avif');
  });
  return avifSupportPromise;
}

@Component({
  selector: 'app-image-format-converter',
  imports: [PreviewBackgroundChips, PreviewBackgroundTarget, ToolShell, ErrorPanel, FileDrop],
  templateUrl: './image-format-converter.html',
})
export class ImageFormatConverter {
  private readonly persistence = inject(PersistenceService);

  protected readonly outputFormat = this.persistence.signal<ImageOutputFormat>('image-format-converter', 'format', 'local', 'image/webp');
  protected readonly quality = this.persistence.signal('image-format-converter', 'quality', 'local', 0.92);
  protected readonly previewBg = this.persistence.signal<PreviewBackground>('image-format-converter', 'preview-background', 'local', 'theme');

  protected readonly rejection = signal<string | null>(null);
  protected readonly selectedFile = signal<File | null>(null);
  protected readonly avifSupported = signal<boolean | null>(null);
  protected readonly resultUrl = signal<string | null>(null);
  protected readonly resultFilename = signal<string | null>(null);
  protected readonly resultSize = signal(0);

  constructor() {
    detectAvifSupport().then((supported) => this.avifSupported.set(supported));
  }

  protected onFileSelected(file: File): void {
    this.rejection.set(null);
    this.selectedFile.set(file);
    const previousUrl = this.resultUrl();
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    this.resultUrl.set(null);
  }

  protected async convert(): Promise<void> {
    const file = this.selectedFile();
    if (!file) return;

    if (this.outputFormat() === 'image/avif' && this.avifSupported() === false) {
      this.rejection.set("AVIF encoding isn't supported in this browser -- pick PNG, JPEG, or WebP instead.");
      return;
    }

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

      const format = this.outputFormat();
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, format, this.quality()));
      if (!blob || (format === 'image/avif' && blob.type !== 'image/avif')) {
        this.rejection.set(`This browser couldn't encode ${format}.`);
        return;
      }

      const previousUrl = this.resultUrl();
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      this.resultUrl.set(URL.createObjectURL(blob));
      this.resultFilename.set(replaceExtension(file.name, format));
      this.resultSize.set(blob.size);
    } catch {
      this.rejection.set("Couldn't convert this image.");
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
