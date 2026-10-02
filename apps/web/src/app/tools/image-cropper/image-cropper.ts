import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { FileDrop } from '../../shared/components/file-drop/file-drop';
import { downloadFile } from '../../shared/utils/download-file';
import { clampCropRect, CropRect, Point, rectFromPoints, scaleRectToNatural } from "@dude/tool-engine/tools/image-cropper/crop-rect";
import { PersistenceService } from '../../core/persistence/persistence.service';
import { PreviewBackground } from "@dude/tool-engine/shared/components/preview-background/preview-background-style";
import { PreviewBackgroundChips, PreviewBackgroundTarget } from '../../shared/components/preview-background/preview-background';

@Component({
  selector: 'app-image-cropper',
  imports: [PreviewBackgroundChips, PreviewBackgroundTarget, ToolShell, ErrorPanel, FileDrop],
  templateUrl: './image-cropper.html',
})
export class ImageCropper {
  private readonly persistence = inject(PersistenceService);
  private readonly imageEl = viewChild<ElementRef<HTMLImageElement>>('previewImage');

  protected readonly previewBg = this.persistence.signal<PreviewBackground>('image-cropper', 'preview-background', 'local', 'theme');

  protected readonly rejection = signal<string | null>(null);
  protected readonly selectedFile = signal<File | null>(null);
  protected readonly sourceUrl = signal<string | null>(null);
  protected readonly naturalWidth = signal(0);
  protected readonly naturalHeight = signal(0);

  protected readonly dragging = signal(false);
  private dragStart: Point | null = null;
  protected readonly displayRect = signal<CropRect | null>(null);

  protected readonly resultUrl = signal<string | null>(null);
  protected readonly resultFilename = signal<string | null>(null);

  protected async onFileSelected(file: File): Promise<void> {
    this.rejection.set(null);
    this.selectedFile.set(file);
    this.displayRect.set(null);

    const previousSourceUrl = this.sourceUrl();
    if (previousSourceUrl) URL.revokeObjectURL(previousSourceUrl);
    const previousResultUrl = this.resultUrl();
    if (previousResultUrl) URL.revokeObjectURL(previousResultUrl);
    this.resultUrl.set(null);

    const bitmap = await createImageBitmap(file);
    this.naturalWidth.set(bitmap.width);
    this.naturalHeight.set(bitmap.height);
    bitmap.close();

    this.sourceUrl.set(URL.createObjectURL(file));
  }

  protected onPointerDown(event: PointerEvent): void {
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    this.dragStart = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    this.dragging.set(true);
    this.displayRect.set(null);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.dragging() || !this.dragStart) return;
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    const current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    this.displayRect.set(rectFromPoints(this.dragStart, current));
  }

  protected onPointerUp(): void {
    this.dragging.set(false);
    this.dragStart = null;
  }

  protected async crop(): Promise<void> {
    const file = this.selectedFile();
    const displayed = this.displayRect();
    const img = this.imageEl()?.nativeElement;
    if (!file || !displayed || !img || displayed.width < 1 || displayed.height < 1) return;

    this.rejection.set(null);
    try {
      const natural = clampCropRect(
        scaleRectToNatural(displayed, img.clientWidth, img.clientHeight, this.naturalWidth(), this.naturalHeight()),
        this.naturalWidth(),
        this.naturalHeight(),
      );
      if (natural.width < 1 || natural.height < 1) {
        this.rejection.set('Select a larger crop area.');
        return;
      }

      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = natural.width;
      canvas.height = natural.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable.');
      ctx.drawImage(bitmap, natural.x, natural.y, natural.width, natural.height, 0, 0, natural.width, natural.height);
      bitmap.close();

      const outputMime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, outputMime, 0.92));
      if (!blob) throw new Error('Failed to encode cropped image.');

      const previousUrl = this.resultUrl();
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      this.resultUrl.set(URL.createObjectURL(blob));
      this.resultFilename.set(file.name.replace(/\.\w+$/, '') + (outputMime === 'image/png' ? '-cropped.png' : '-cropped.jpg'));
    } catch {
      this.rejection.set("Couldn't crop this image.");
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
