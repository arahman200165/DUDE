import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { generateRange } from "./range-generate.js";

/**
 * Pipeline-step adapter for the Range Generator tool — representative of a generator-style tool
 * with no meaningful input (like `uuid.pipeline-step.ts`): the flowing value is ignored and a
 * fixed 1-10 range is always produced. Until per-step params ship (DUDE_PRD.md §21 Item 2, v1.1),
 * a pipeline step cannot select a different start/end/step.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Range Generator expects text input.', kind: 'invalid-input' } };
    }

    const result = generateRange({ start: 1, end: 10, step: 1 });
    return result.ok
      ? { ok: true, output: { type: 'text', value: result.value.join(',') } }
      : { ok: false, error: { message: result.error, kind: 'invalid-input' } };
  },
};
