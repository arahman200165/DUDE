import { Component, ElementRef, computed, effect, signal, viewChild } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { FileDrop } from '../../shared/components/file-drop/file-drop';
import { parseColor, type ColorFormats } from '../color-converter/color-convert';
import { samplePixel } from './pixel-sample';

/**
 * Upload-image mode only. The live-screen-capture variant needs native screen
 * access and is cross-referenced at PRD Phase 35 item 6 -- deliberately not
 * attempted here.
 */
@Component({
  selector: 'app-pixel-color-picker',
  imports: [ToolShell, ErrorPanel, CopyButton, FileDrop],
  templateUrl: './pixel-color-picker.html',
})
export class PixelColorPicker {
  protected readonly rejection = signal<string | null>(null);
  private readonly imageData = signal<ImageData | null>(null);
  protected readonly pickedFormats = signal<ColorFormats | null>(null);

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvas');

  protected readonly imageSize = computed(() => {
    const data = this.imageData();
    return data ? { width: data.width, height: data.height } : null;
  });

  constructor() {
    effect(() => {
      const data = this.imageData();
      const canvas = this.canvasRef()?.nativeElement;
      if (!data || !canvas) return;

      canvas.width = data.width;
      canvas.height = data.height;
      canvas.getContext('2d')?.putImageData(data, 0, 0);
    });
  }

  protected async onFileSelected(file: File): Promise<void> {
    this.rejection.set(null);
    this.pickedFormats.set(null);

    const bitmap = await createImageBitmap(file);
    const offscreen = document.createElement('canvas');
    offscreen.width = bitmap.width;
    offscreen.height = bitmap.height;
    const ctx = offscreen.getContext('2d');
    if (!ctx) {
      this.rejection.set('Canvas 2D context unavailable.');
      return;
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    this.imageData.set(ctx.getImageData(0, 0, offscreen.width, offscreen.height));
  }

  protected onRejected(message: string): void {
    this.rejection.set(message);
  }

  protected onCanvasPointer(event: MouseEvent): void {
    const data = this.imageData();
    const canvas = this.canvasRef()?.nativeElement;
    if (!data || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = data.width / rect.width;
    const scaleY = data.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    const pixel = samplePixel(data, x, y);
    if (!pixel) return;

    const result = parseColor(`rgba(${pixel.r}, ${pixel.g}, ${pixel.b}, ${(pixel.a / 255).toFixed(3)})`);
    this.pickedFormats.set(result.ok ? result.formats : null);
  }
}
