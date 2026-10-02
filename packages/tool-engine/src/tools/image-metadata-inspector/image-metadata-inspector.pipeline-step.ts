import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { sniffImageType } from "../../shared/utils/image-signature.js";
import { simplifyRatio } from "../../shared/utils/aspect-ratio.js";
import { parsePngIhdr } from "./png-header.js";

/**
 * Pipeline-step adapter for the Image Metadata Inspector tool. File size and format detection
 * (magic-byte sniffing, PNG IHDR bit-depth/color-type) are pure byte reads with no DOM
 * dependency. Pixel dimensions for non-PNG formats come from `createImageBitmap`, exactly as
 * the component does — wrapped in the same best-effort try/catch the component already uses,
 * so a jsdom test environment lacking `createImageBitmap` degrades to "unavailable" dimensions
 * rather than failing the whole step.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['file'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'file') {
      return { ok: false, error: { message: 'Image Metadata Inspector expects file input.', kind: 'invalid-input' } };
    }

    let bytes: Uint8Array;
    try {
      const binary = atob(input.value.base64.trim());
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    } catch {
      return { ok: false, error: { message: 'File content is not valid Base64.', kind: 'invalid-input' } };
    }

    const detected = sniffImageType(bytes);

    let width = 0;
    let height = 0;
    try {
      const bitmap = await hostDecodeImage(bytes, input.value.mimeType || detected?.mime || 'application/octet-stream');
      width = bitmap.width;
      height = bitmap.height;
      bitmap.close?.();
    } catch {
      // Falls through with width/height at 0, same as the component's own best-effort handling.
    }

    return {
      ok: true,
      output: {
        type: 'json',
        value: {
          fileName: input.value.name,
          fileSize: bytes.length,
          declaredMime: input.value.mimeType || 'unknown',
          detectedMime: detected?.mime ?? null,
          width,
          height,
          aspectRatio: width && height ? simplifyRatio(width, height) : 'unavailable',
          pngIhdr: detected?.mime === 'image/png' ? parsePngIhdr(bytes) : null,
        },
      },
    };
  },
};
import { hostDecodeImage } from "@dude/crypto/host";
