import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { encodeBytesToBase64, parseBase64Image } from "./base64-image-codec.js";

/**
 * Pipeline-step adapter for the Base64 Image Viewer tool. Handles both directions the tool
 * itself supports without any canvas/Image decode — pure Base64 <-> bytes conversion, magic-byte
 * sniffed. A `text` input is parsed as a raw Base64 payload or an already-wrapped data URI and
 * normalized into a data URI; a `file` input is re-encoded into that same data URI form. Both
 * directions produce one `text` value (the data URI), matching the tool's own preview surface.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text', 'file'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type === 'text') {
      const result = parseBase64Image(input.value);
      return result.ok
        ? { ok: true, output: { type: 'text', value: result.dataUri } }
        : { ok: false, error: { message: result.error, kind: 'invalid-input' } };
    }

    if (input.type === 'file') {
      try {
        const binary = atob(input.value.base64.trim());
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const { dataUri } = encodeBytesToBase64(bytes, input.value.mimeType || 'application/octet-stream');
        return { ok: true, output: { type: 'text', value: dataUri } };
      } catch {
        return { ok: false, error: { message: 'File content is not valid Base64.', kind: 'invalid-input' } };
      }
    }

    return { ok: false, error: { message: 'Base64 Image Viewer expects text or file input.', kind: 'invalid-input' } };
  },
};
