import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { clampCropRect } from "@dude/tool-engine/tools/image-cropper/crop-rect";

/**
 * Pipeline-step adapter for the Image Cropper tool. Always crops the centered 50%-by-50% region
 * of the image — a pipeline step has no drag gesture to derive a crop rectangle from, so this
 * is the most defensible single-input default (the crop rectangle is small config, not a second
 * freeform document, matching this migration's image-cropper guidance).
 *
 * The actual crop genuinely requires `createImageBitmap` and a real `<canvas>` 2D context —
 * browser APIs jsdom doesn't implement (no `canvas` npm package is installed in this repo),
 * matching this migration's guidance for image/binary tools tied to real DOM decode. This
 * mirrors the component's own `crop()` exactly; it is expected to work in a real browser but
 * cannot be exercised end-to-end by this repo's jsdom-based unit tests.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['file'],
  produces: ['file'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'file') {
      return { ok: false, error: { message: 'Image Cropper expects file input.', kind: 'invalid-input' } };
    }

    try {
      const binary = atob(input.value.base64.trim());
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const mimeType = input.value.mimeType || 'image/png';
      const blob = new Blob([bytes], { type: mimeType });
      const bitmap = await createImageBitmap(blob);

      const natural = clampCropRect(
        { x: bitmap.width * 0.25, y: bitmap.height * 0.25, width: bitmap.width * 0.5, height: bitmap.height * 0.5 },
        bitmap.width,
        bitmap.height,
      );
      if (natural.width < 1 || natural.height < 1) throw new Error('Image is too small to crop.');

      const canvas = document.createElement('canvas');
      canvas.width = natural.width;
      canvas.height = natural.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable.');

      ctx.drawImage(bitmap, natural.x, natural.y, natural.width, natural.height, 0, 0, natural.width, natural.height);
      bitmap.close?.();

      const outputMime = mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
      const outputBlob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, outputMime, 0.92));
      if (!outputBlob) throw new Error('Failed to encode the cropped image.');

      const outputBuffer = await outputBlob.arrayBuffer();
      const outputBytes = new Uint8Array(outputBuffer);
      let outputBinary = '';
      for (const byte of outputBytes) outputBinary += String.fromCharCode(byte);

      const extension = outputMime === 'image/png' ? 'png' : 'jpg';
      return {
        ok: true,
        output: {
          type: 'file',
          value: { name: input.value.name.replace(/\.\w+$/, '') + `-cropped.${extension}`, mimeType: outputMime, base64: btoa(outputBinary) },
        },
      };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : "Couldn't crop this image.", kind: 'execution-error' } };
    }
  },
};
