import { Component, ElementRef, computed, effect, inject, viewChild } from '@angular/core';
import JsBarcode from 'jsbarcode';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { validateBarcodeValue, type BarcodeFormat } from "@dude/tool-engine/tools/barcode-generator/barcode-validate";

const FORMATS: readonly BarcodeFormat[] = ['CODE128', 'EAN13', 'EAN8', 'UPC', 'CODE39', 'ITF14', 'codabar'];

@Component({
  selector: 'app-barcode-generator',
  imports: [ToolShell, ErrorPanel],
  templateUrl: './barcode-generator.html',
})
export class BarcodeGenerator {
  private readonly persistence = inject(PersistenceService);

  protected readonly formats = FORMATS;
  protected readonly format = this.persistence.signal<BarcodeFormat>('barcode-generator', 'format', 'local', 'CODE128');
  protected readonly value = this.persistence.signal('barcode-generator', 'value', 'session', '123456789012');

  private readonly svgRef = viewChild<ElementRef<SVGSVGElement>>('svg');

  protected readonly validation = computed(() => validateBarcodeValue(this.format(), this.value()));

  constructor() {
    effect(() => {
      const svg = this.svgRef()?.nativeElement;
      const validation = this.validation();
      if (!svg) return;

      if (!validation.ok) {
        while (svg.firstChild) svg.removeChild(svg.firstChild);
        return;
      }

      try {
        JsBarcode(svg, this.value().trim(), { format: this.format(), width: 2, height: 80, displayValue: true });
      } catch {
        while (svg.firstChild) svg.removeChild(svg.firstChild);
      }
    });
  }

  protected setFormat(format: BarcodeFormat): void {
    this.format.set(format);
  }

  protected download(): void {
    const svg = this.svgRef()?.nativeElement;
    if (!svg) return;

    const serialized = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([serialized], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'barcode.svg';
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
