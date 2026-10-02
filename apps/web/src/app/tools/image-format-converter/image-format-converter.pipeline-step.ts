import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { replaceExtension } from "@dude/tool-engine/tools/image-format-converter/format-mime";

/**
 * Pipeline-step adapter for the Image Format Converter tool. Always converts to the tool's own
 * default output format (WebP, quality 0.92) — until per-step params ship (DUDE_PRD.md §21
 * Item 2, v1.1), a pipeline step can't select PNG/JPEG/AVIF instead.
 *
 * The actual re-encode genuinely requires `createImageBitmap` and a real `<canvas>` 2D context
 * — browser APIs jsdom doesn't implement (no `canvas` npm package is installed in this repo),
 * matching this migration's guidance for image/binary tools tied to real DOM decode. This
 * mirrors the component's own `convert()` exactly; it is expected to work in a real browser but
 * cannot be exercised end-to-end by this repo's jsdom-based unit tests.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['file'],
  produces: ['file'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'file') {
      return { ok: false, error: { message: 'Image Format Converter expects file input.', kind: 'invalid-input' } };
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

      const format = 'image/webp' as const;
      const outputBlob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, format, 0.92));
      if (!outputBlob || outputBlob.type !== format) throw new Error(`This environment couldn't encode ${format}.`);

      const outputBuffer = await outputBlob.arrayBuffer();
      const outputBytes = new Uint8Array(outputBuffer);
      let outputBinary = '';
      for (const byte of outputBytes) outputBinary += String.fromCharCode(byte);

      return {
        ok: true,
        output: { type: 'file', value: { name: replaceExtension(input.value.name, format), mimeType: format, base64: btoa(outputBinary) } },
      };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : "Couldn't convert this image.", kind: 'execution-error' } };
    }
  },
};
