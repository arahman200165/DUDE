import { Component, computed, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { FileDrop } from '../../shared/components/file-drop/file-drop';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { downloadFile } from '../../shared/utils/download-file';
import { computeResizedDimensions, ResizeInput } from './resize-dimensions';
import { PreviewBackground } from '../../shared/components/preview-background/preview-background-style';
import { PreviewBackgroundChips, PreviewBackgroundTarget } from '../../shared/components/preview-background/preview-background';

export type ResizeMode = 'dimensions' | 'percent';
export type ResizeOutputFormat = 'image/png' | 'image/jpeg' | 'image/webp';

@Component({
  selector: 'app-image-resizer',
  imports: [PreviewBackgroundChips, PreviewBackgroundTarget, ToolShell, ErrorPanel, FileDrop],
  templateUrl: './image-resizer.html',
})
export class ImageResizer {
  private readonly persistence = inject(PersistenceService);

  protected readonly mode = this.persistence.signal<ResizeMode>('image-resizer', 'mode', 'local', 'percent');
  protected readonly lockAspect = this.persistence.signal('image-resizer', 'lock-aspect', 'local', true);
  protected readonly outputFormat = this.persistence.signal<ResizeOutputFormat>('image-resizer', 'format', 'local', 'image/png');
  protected readonly quality = this.persistence.signal('image-resizer', 'quality', 'local', 0.92);
  protected readonly previewBg = this.persistence.signal<PreviewBackground>('image-resizer', 'preview-background', 'local', 'theme');

  protected readonly rejection = signal<string | null>(null);
  protected readonly originalWidth = signal(0);
  protected readonly originalHeight = signal(0);
  protected readonly targetWidth = signal<number | undefined>(undefined);
  protected readonly targetHeight = signal<number | undefined>(undefined);
  protected readonly percent = signal(100);
  protected readonly selectedFile = signal<File | null>(null);
  protected readonly resultUrl = signal<string | null>(null);
  protected readonly resultFilename = signal<string | null>(null);

  protected readonly resizeInput = computed<ResizeInput>(() => ({
    originalWidth: this.originalWidth(),
    originalHeight: this.originalHeight(),
    mode: this.mode(),
    targetWidth: this.targetWidth(),
    targetHeight: this.targetHeight(),
    percent: this.percent(),
    lockAspect: this.lockAspect(),
  }));

  protected readonly output = computed(() => computeResizedDimensions(this.resizeInput()));

  protected async onFileSelected(file: File): Promise<void> {
    this.rejection.set(null);
    this.selectedFile.set(file);
    const bitmap = await createImageBitmap(file);
    this.originalWidth.set(bitmap.width);
    this.originalHeight.set(bitmap.height);
    this.targetWidth.set(bitmap.width);
    this.targetHeight.set(bitmap.height);
    bitmap.close();
  }

  protected onWidthChange(event: Event): void {
    this.targetWidth.set(Number((event.target as HTMLInputElement).value) || undefined);
    this.targetHeight.set(undefined);
  }

  protected onHeightChange(event: Event): void {
    this.targetHeight.set(Number((event.target as HTMLInputElement).value) || undefined);
    this.targetWidth.set(undefined);
  }

  protected onPercentChange(event: Event): void {
    this.percent.set(Number((event.target as HTMLInputElement).value) || 100);
  }

  protected async resize(): Promise<void> {
    const file = this.selectedFile();
    if (!file) return;
    this.rejection.set(null);

    try {
      const bitmap = await createImageBitmap(file);
      const { width, height } = this.output();
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable.');
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();

      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, this.outputFormat(), this.quality()));
      if (!blob) throw new Error('Failed to encode resized image.');

      const previousUrl = this.resultUrl();
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      this.resultUrl.set(URL.createObjectURL(blob));
      const extension = this.outputFormat().split('/')[1];
      this.resultFilename.set(file.name.replace(/\.\w+$/, '') + `-resized.${extension}`);
    } catch {
      this.rejection.set("Couldn't resize this image.");
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
