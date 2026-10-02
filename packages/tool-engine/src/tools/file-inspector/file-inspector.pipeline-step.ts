import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { inspectFile } from "./file-inspector-logic.js";

/** Pipeline-step adapter for the File Inspector tool. Calls the pure `inspectFile` function directly, not via its `.worker.ts` variant. */
export const pipelineStep: PipelineStep = {
  accepts: ['file'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'file') {
      return { ok: false, error: { message: 'File Inspector expects file input.', kind: 'invalid-input' } };
    }

    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(input.value.base64.trim()), (char) => char.charCodeAt(0));
    } catch {
      return { ok: false, error: { message: 'File content is not valid Base64.', kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'json', value: inspectFile(bytes, input.value.name, input.value.mimeType || null) } };
  },
};
