import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { generateCuids } from "./cuid-logic.js";

/**
 * Pipeline-step adapter for the CUID Generator tool. Generator-style with no
 * meaningful input: the flowing value is ignored and a single CUID2 is always
 * generated with the tool's own defaults (length 24).
 */
export const pipelineStep: PipelineStep = {
  accepts: ['json'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'json') {
      return { ok: false, error: { message: 'CUID Generator expects JSON input.', kind: 'invalid-input' } };
    }

    try {
      const result = generateCuids(1, 24);
      if (!result.ok) {
        return { ok: false, error: { message: result.error, kind: 'execution-error' } };
      }

      return { ok: true, output: { type: 'text', value: result.values[0] } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Failed to generate CUID.', kind: 'execution-error' } };
    }
  },
};
