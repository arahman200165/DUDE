import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { detectCsvDelimiter } from "./csv-delimiter-detect.js";

/** Pipeline-step adapter for the CSV Delimiter Detector tool. */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['table'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'CSV Delimiter Detector expects text input.', kind: 'invalid-input' } };
    }

    const result = detectCsvDelimiter(input.value);
    if (!result.ok) {
      return { ok: false, error: { message: result.error.message, kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'table', value: result.table } };
  },
};
