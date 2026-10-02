import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { detectFileType } from "./file-type-detector-logic.js";

/** Pipeline-step adapter for the File Signature & Type Detector tool. */
export const pipelineStep: PipelineStep = {
  accepts: ['file'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'file') {
      return { ok: false, error: { message: 'File Signature & Type Detector expects file input.', kind: 'invalid-input' } };
    }

    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(input.value.base64.trim()), (char) => char.charCodeAt(0));
    } catch {
      return { ok: false, error: { message: 'File content is not valid Base64.', kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'json', value: detectFileType(bytes, input.value.name, input.value.mimeType || null) } };
  },
};
