import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { HTTP_STATUS_CODES } from "../../shared/utils/http-status-codes.js";
import { filterHttpStatusCodes } from "./http-status-search.js";

/**
 * Pipeline-step adapter for the HTTP Status Code Reference tool. A genuine lookup function
 * (filter text -> matching status-code groups) over the tool's static reference table, rather
 * than a transform of the input value itself.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'HTTP Status Code Reference expects text input.', kind: 'invalid-input' } };
    }

    const groups = filterHttpStatusCodes(HTTP_STATUS_CODES, input.value);
    return { ok: true, output: { type: 'json', value: groups } };
  },
};
