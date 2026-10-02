import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { parseColor } from "@dude/tool-engine/tools/color-converter/color-convert";
import { samplePixel } from './pixel-sample';

/**
 * Pipeline-step adapter for the Pixel Color Picker tool. Always samples the image's center
 * pixel — the tool's own UI instead samples wherever the user clicks, which a pipeline step has
 * no equivalent of, so the center pixel is the most defensible single-input default.
 *
 * Decoding the uploaded image into pixel data genuinely requires `createImageBitmap` and a real
 * `<canvas>` 2D context — browser APIs jsdom doesn't implement (no `canvas` npm package is
 * installed in this repo), matching this migration's guidance for image/binary tools tied to
 * real DOM decode. This mirrors the component's own `onFileSelected` exactly; it is expected to
 * work in a real browser but cannot be exercised end-to-end by this repo's jsdom-based tests.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['file'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'file') {
      return { ok: false, error: { message: 'Pixel Color Picker expects file input.', kind: 'invalid-input' } };
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

      const pixel = samplePixel(imageData, Math.floor(canvas.width / 2), Math.floor(canvas.height / 2));
      if (!pixel) throw new Error('Could not sample the center pixel.');

      const parsed = parseColor(`rgba(${pixel.r}, ${pixel.g}, ${pixel.b}, ${(pixel.a / 255).toFixed(3)})`);
      if (!parsed.ok) throw new Error(parsed.error);

      return { ok: true, output: { type: 'json', value: parsed.formats } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : "Couldn't sample this image.", kind: 'execution-error' } };
    }
  },
};
