import { Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { FileDrop } from '../../shared/components/file-drop/file-drop';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { COLOR_BLINDNESS_TYPES, simulateColorBlindness, type ColorBlindnessType } from "@dude/tool-engine/tools/color-blindness-simulator/color-blindness-simulator-logic";

interface DecodedImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

@Component({
  selector: 'app-color-blindness-simulator',
  imports: [ToolShell, ErrorPanel, FileDrop],
  templateUrl: './color-blindness-simulator.html',
})
export class ColorBlindnessSimulator {
  private readonly persistence = inject(PersistenceService);

  protected readonly types = COLOR_BLINDNESS_TYPES;
  protected readonly type = this.persistence.signal<ColorBlindnessType>('color-blindness-simulator', 'type', 'local', 'protanopia');
  protected readonly error = signal<string | null>(null);
  protected readonly hasImage = signal(false);

  private readonly originalImage = signal<DecodedImage | null>(null);
  private readonly originalCanvas = viewChild<ElementRef<HTMLCanvasElement>>('originalCanvas');
  private readonly simulatedCanvas = viewChild<ElementRef<HTMLCanvasElement>>('simulatedCanvas');

  constructor() {
    effect(() => {
      const image = this.originalImage();
      const type = this.type();
      if (image) this.renderSimulated(image, type);
    });
  }

  protected onFileSelected(file: File): void {
    this.error.set(null);
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      const canvas = this.originalCanvas()?.nativeElement;
      if (!canvas) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      this.originalImage.set({ width: canvas.width, height: canvas.height, data: imageData.data });
      this.hasImage.set(true);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      this.error.set('Could not load this file as an image.');
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  protected onRejected(message: string): void {
    this.error.set(message);
  }

  private renderSimulated(image: DecodedImage, type: ColorBlindnessType): void {
    const canvas = this.simulatedCanvas()?.nativeElement;
    if (!canvas) return;
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const simulated = simulateColorBlindness(image.data, type);
    ctx.putImageData(new ImageData(simulated, image.width, image.height), 0, 0);
  }

  protected onTypeChange(event: Event): void {
    this.type.set((event.target as HTMLSelectElement).value as ColorBlindnessType);
  }
}
