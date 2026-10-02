import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { MultipartField, buildMultipartBody, generateBoundary } from "./multipart-build.js";

/**
 * Pipeline-step adapter for the Multipart Form Data Builder tool. Wraps the incoming value as a
 * single form field — a `text` value becomes a text field named "field", a `file` value becomes
 * a file field carrying its name/MIME type/size — and renders the construct-and-display body
 * preview. Uses a fixed boundary (rather than the component's random one) so the output is
 * deterministic.
 */
const BOUNDARY = generateBoundary('0000000000000000');

export const pipelineStep: PipelineStep = {
  accepts: ['text', 'file'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    let field: MultipartField;

    if (input.type === 'text') {
      field = { kind: 'text', key: 'field', value: input.value };
    } else if (input.type === 'file') {
      let size = 0;
      try {
        size = atob(input.value.base64).length;
      } catch {
        return { ok: false, error: { message: 'Multipart Form Data Builder could not read the file data.', kind: 'invalid-input' } };
      }
      field = { kind: 'file', key: 'file', filename: input.value.name, contentType: input.value.mimeType, size };
    } else {
      return { ok: false, error: { message: 'Multipart Form Data Builder expects text or file input.', kind: 'invalid-input' } };
    }

    const body = buildMultipartBody([field], BOUNDARY);
    return { ok: true, output: { type: 'text', value: body } };
  },
};
