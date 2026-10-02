import { toDataURL } from 'qrcode';
import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";

/**
 * Pipeline-step adapter for the QR Code Generator tool. Always uses the tool's "text" preset
 * (piped text encoded directly as the QR payload) with its own default error-correction level
 * ("M") — until per-step params ship (DUDE_PRD.md §21 Item 2, v1.1), a pipeline step can't
 * select the wifi/contact/totp presets.
 *
 * `qrcode`'s `toDataURL` renders through a `<canvas>` in a browser bundle — a real browser is
 * expected to work exactly like the component does, but this repo's jsdom test environment has
 * no `canvas` npm package installed, so this cannot be verified as functionally correct here;
 * flagged per this migration's guidance for browser-API-dependent tools.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['file'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'QR Code Generator expects text input.', kind: 'invalid-input' } };
    }
    if (input.value.trim() === '') {
      return { ok: false, error: { message: 'Enter text to encode as a QR code.', kind: 'invalid-input' } };
    }

    try {
      const dataUrl = await toDataURL(input.value, { errorCorrectionLevel: 'M', margin: 2, width: 320 });
      const base64 = dataUrl.split(',')[1] ?? '';
      return { ok: true, output: { type: 'file', value: { name: 'qr-code.png', mimeType: 'image/png', base64 } } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Could not generate this QR code.', kind: 'execution-error' } };
    }
  },
};
