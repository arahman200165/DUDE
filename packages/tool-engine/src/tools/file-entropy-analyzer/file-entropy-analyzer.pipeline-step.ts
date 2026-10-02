import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { analyzeFileEntropy } from "./file-entropy-analyzer-logic.js";

/**
 * Pipeline-step adapter for the File Entropy Analyzer tool. Calls the pure `analyzeFileEntropy`
 * function directly on the main thread -- per this batch's instructions, a `.worker.ts` variant
 * is not wired up here; `execution.worker: 'optional'` only kicks in above a size threshold the
 * component itself decides.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['file'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'file') {
      return { ok: false, error: { message: 'File Entropy Analyzer expects file input.', kind: 'invalid-input' } };
    }

    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(input.value.base64.trim()), (char) => char.charCodeAt(0));
    } catch {
      return { ok: false, error: { message: 'File content is not valid Base64.', kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'json', value: analyzeFileEntropy(bytes) } };
  },
};
