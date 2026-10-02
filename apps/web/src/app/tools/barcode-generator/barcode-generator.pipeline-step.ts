import JsBarcode from 'jsbarcode';
import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { validateBarcodeValue } from "@dude/tool-engine/tools/barcode-generator/barcode-validate";

/**
 * Pipeline-step adapter for the Barcode Generator tool. Always uses the tool's own default
 * format ("CODE128") — until per-step params ship (DUDE_PRD.md §21 Item 2, v1.1), a pipeline
 * step can't select among the other supported symbologies. Unlike the QR Code Generator,
 * `jsbarcode` renders by manipulating SVG DOM nodes directly (no `<canvas>` raster step), which
 * jsdom's DOM implementation supports even without a real graphics backend. `displayValue` is
 * left off: with it on, jsbarcode measures the human-readable label's width via a hidden
 * `<canvas>` 2D context, which isn't available in this project's test environment (no `canvas`
 * npm package) and isn't needed for a headless pipeline step's output anyway.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['file'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Barcode Generator expects text input.', kind: 'invalid-input' } };
    }

    const value = input.value.trim();
    const validation = validateBarcodeValue('CODE128', value);
    if (!validation.ok) {
      return { ok: false, error: { message: validation.message ?? 'Invalid barcode value.', kind: 'invalid-input' } };
    }

    try {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      JsBarcode(svg, value, { format: 'CODE128', width: 2, height: 80, displayValue: false });

      const serialized = new XMLSerializer().serializeToString(svg);
      const bytes = new TextEncoder().encode(serialized);
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return { ok: true, output: { type: 'file', value: { name: 'barcode.svg', mimeType: 'image/svg+xml', base64: btoa(binary) } } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Could not generate this barcode.', kind: 'execution-error' } };
    }
  },
};
