import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { convertCase } from "./case-convert.js";

/**
 * Pipeline-step adapter for the Case Converter tool. Always converts to camelCase (the
 * component's own default style) until per-step params ship (DUDE_PRD.md §21 Item 2, v1.1).
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Case Converter expects text input.', kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'text', value: convertCase(input.value, 'camel') } };
  },
};
