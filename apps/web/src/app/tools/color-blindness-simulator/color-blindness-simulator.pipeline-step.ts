import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { simulateColorBlindness } from "@dude/tool-engine/tools/color-blindness-simulator/color-blindness-simulator-logic";

/**
 * Pipeline-step adapter for the Color Blindness Simulator tool. Always simulates the tool's
 * own default deficiency ("protanopia") — until per-step params ship (DUDE_PRD.md §21 Item 2,
 * v1.1), a pipeline step can't select among the three simulated types.
 *
 * The per-pixel matrix transform itself (`simulateColorBlindness`) is pure and framework-free,
 * but decoding/re-encoding the uploaded image bytes into/out of raw RGBA pixels genuinely
 * requires `createImageBitmap` and a real `<canvas>` 2D context — browser APIs neither of
 * which jsdom implements (no `canvas` npm package is installed in this repo), matching this
 * migration's guidance for image/binary tools tied to real DOM decode. This mirrors the
 * component's own `onFileSelected`/`renderSimulated` pipeline exactly; it is expected to work
 * in a real browser but cannot be exercised end-to-end by this repo's jsdom-based unit tests.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['file'],
  produces: ['file'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'file') {
      return { ok: false, error: { message: 'Color Blindness Simulator expects file input.', kind: 'invalid-input' } };
    }

    try {
      const binary = atob(input.value.base64.trim());
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const blob = new Blob([bytes], { type: input.value.mimeType || 'image/png' });
      const bitmap = await createImageBitmap(blob);

      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable.');

      ctx.drawImage(bitmap, 0, 0);
      bitmap.close?.();
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const simulated = simulateColorBlindness(imageData.data, 'protanopia');
      ctx.putImageData(new ImageData(simulated, canvas.width, canvas.height), 0, 0);

      const outputBlob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!outputBlob) throw new Error('Failed to encode the simulated image.');

      const outputBuffer = await outputBlob.arrayBuffer();
      const outputBytes = new Uint8Array(outputBuffer);
      let outputBinary = '';
      for (const byte of outputBytes) outputBinary += String.fromCharCode(byte);

      return {
        ok: true,
        output: {
          type: 'file',
          value: { name: input.value.name.replace(/\.\w+$/, '') + '-protanopia.png', mimeType: 'image/png', base64: btoa(outputBinary) },
        },
      };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : "Couldn't simulate this image.", kind: 'execution-error' } };
    }
  },
};
