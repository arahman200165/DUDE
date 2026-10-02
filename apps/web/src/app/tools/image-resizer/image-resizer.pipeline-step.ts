import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { computeResizedDimensions } from "@dude/tool-engine/tools/image-resizer/resize-dimensions";

/**
 * Pipeline-step adapter for the Image Resizer tool. Always resizes to 100% (a no-op resize) at
 * the tool's own default output format/quality (PNG, 0.92) — until per-step params ship
 * (DUDE_PRD.md §21 Item 2, v1.1), a pipeline step can't accept an explicit target size, and
 * `computeResizedDimensions`'s pure dimension math needs one to do anything else meaningful.
 *
 * The actual pixel resample genuinely requires `createImageBitmap` and a real `<canvas>` 2D
 * context — browser APIs jsdom doesn't implement (no `canvas` npm package is installed in this
 * repo), matching this migration's guidance for image/binary tools tied to real DOM decode.
 * This mirrors the component's own `resize()` exactly; it is expected to work in a real browser
 * but cannot be exercised end-to-end by this repo's jsdom-based unit tests.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['file'],
  produces: ['file'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'file') {
      return { ok: false, error: { message: 'Image Resizer expects file input.', kind: 'invalid-input' } };
    }

    try {
      const binary = atob(input.value.base64.trim());
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const blob = new Blob([bytes], { type: input.value.mimeType || 'image/png' });
      const bitmap = await createImageBitmap(blob);

      const { width, height } = computeResizedDimensions({
        originalWidth: bitmap.width,
        originalHeight: bitmap.height,
        mode: 'percent',
        percent: 100,
        lockAspect: true,
      });

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable.');

      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close?.();

      const outputBlob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 0.92));
      if (!outputBlob) throw new Error('Failed to encode the resized image.');

      const outputBuffer = await outputBlob.arrayBuffer();
      const outputBytes = new Uint8Array(outputBuffer);
      let outputBinary = '';
      for (const byte of outputBytes) outputBinary += String.fromCharCode(byte);

      return {
        ok: true,
        output: {
          type: 'file',
          value: { name: input.value.name.replace(/\.\w+$/, '') + '-resized.png', mimeType: 'image/png', base64: btoa(outputBinary) },
        },
      };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : "Couldn't resize this image.", kind: 'execution-error' } };
    }
  },
};
