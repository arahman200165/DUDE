import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { downloadFile } from '../../shared/utils/download-file';
import { PreviewBackground } from "@dude/tool-engine/shared/components/preview-background/preview-background-style";
import { PreviewBackgroundChips, PreviewBackgroundTarget } from '../../shared/components/preview-background/preview-background';
import {
  BARCODE_SYMBOLOGIES,
  DEFAULT_BARCODE_SYMBOLOGY,
  barcodeSvgDataUrl,
  barcodeSymbologyInfo,
  normalizeBarcodeSymbology,
  renderBarcodeSvg,
  type BarcodeSymbology,
} from "@dude/tool-engine/tools/barcode-generator/barcode-render";

const SCALES: readonly number[] = [1, 2, 3, 4, 6, 8];

@Component({
  selector: 'app-barcode-generator',
  imports: [ToolShell, ErrorPanel, PreviewBackgroundChips, PreviewBackgroundTarget],
  templateUrl: './barcode-generator.html',
})
export class BarcodeGenerator {
  private readonly persistence = inject(PersistenceService);

  protected readonly symbologies = BARCODE_SYMBOLOGIES;
  protected readonly scales = SCALES;

  // The persisted key stays `format`; old jsbarcode names (CODE128, UPC, ...) decode to the new ids.
  protected readonly format = this.persistence.signal<BarcodeSymbology>('barcode-generator', 'format', 'local', DEFAULT_BARCODE_SYMBOLOGY, {
    decode: (raw) => normalizeBarcodeSymbology(raw),
  });
  protected readonly value = this.persistence.signal('barcode-generator', 'value', 'session', '123456789012');
  protected readonly scale = this.persistence.signal('barcode-generator', 'scale', 'local', 2);
  protected readonly includeText = this.persistence.signal('barcode-generator', 'includeText', 'local', true);
  protected readonly previewBg = this.persistence.signal<PreviewBackground>('barcode-generator', 'preview-background', 'local', 'theme');

  protected readonly info = computed(() => barcodeSymbologyInfo(this.format()));
  protected readonly rendered = computed(() =>
    renderBarcodeSvg({ symbology: this.format(), text: this.value(), scale: this.scale(), includeText: this.includeText() }),
  );
  protected readonly dataUrl = computed(() => {
    const result = this.rendered();
    return result.ok ? barcodeSvgDataUrl(result.svg) : null;
  });
  protected readonly error = computed(() => {
    const result = this.rendered();
    return result.ok ? null : result.error;
  });

  protected setFormat(raw: string): void {
    const next = normalizeBarcodeSymbology(raw);
    if (!next) return;
    this.format.set(next);
    // Offer the new symbology's sample when the current value is still another symbology's sample.
    if (BARCODE_SYMBOLOGIES.some((item) => item.sample === this.value()) || this.value().trim() === '') {
      this.value.set(barcodeSymbologyInfo(next).sample);
    }
  }

  protected setScale(raw: string): void {
    const scale = Number(raw);
    if (Number.isFinite(scale)) this.scale.set(scale);
  }

  protected downloadSvg(): void {
    const result = this.rendered();
    if (!result.ok) return;
    downloadFile(new Blob([result.svg], { type: 'image/svg+xml' }), `barcode-${this.format()}.svg`, 'image/svg+xml');
  }

  protected async downloadPng(): Promise<void> {
    const result = this.rendered();
    if (!result.ok) return;
    const image = new Image();
    image.src = barcodeSvgDataUrl(result.svg);
    try {
      await image.decode();
    } catch {
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = result.width;
    canvas.height = result.height;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(image, 0, 0, result.width, result.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (blob) downloadFile(blob, `barcode-${this.format()}.png`, 'image/png');
  }
}
