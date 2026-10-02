import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { decodeQrFromImageData } from './qr-decode';

/**
 * Pipeline-step adapter for the QR Code Scanner tool. The live-webcam input path has no
 * representation in `DudeDataType` (a documented PRD vocabulary gap), so this only implements
 * the static-image decode path -- mirroring `qr-code-scanner.ts`'s own `onFileSelected`, but
 * decoding an in-memory `file` value's bytes instead of a `File` from a picker.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['file'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'file') {
      return { ok: false, error: { message: 'QR Code Scanner expects file input.', kind: 'invalid-input' } };
    }

    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(input.value.base64.trim()), (char) => char.charCodeAt(0));
    } catch {
      return { ok: false, error: { message: 'File content is not valid Base64.', kind: 'invalid-input' } };
    }

    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(new Blob([bytes as unknown as BlobPart], { type: input.value.mimeType || 'image/png' }));
    } catch {
      return { ok: false, error: { message: 'Could not decode this file as an image.', kind: 'invalid-input' } };
    }

    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return { ok: false, error: { message: 'Canvas 2D context unavailable.', kind: 'execution-error' } };
    }

    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const decoded = decodeQrFromImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (!decoded) {
      return { ok: false, error: { message: 'No QR code found in this image.', kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'text', value: decoded.data } };
  },
};
