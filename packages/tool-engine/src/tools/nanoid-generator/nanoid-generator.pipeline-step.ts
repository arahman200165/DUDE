import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { generateNanoIds } from "./nanoid-logic.js";

/**
 * Pipeline-step adapter for the NanoID Generator tool. Generator-style with no
 * meaningful input: the flowing value is ignored and a single NanoID is always
 * generated with the tool's own defaults (length 21, default alphabet).
 */
export const pipelineStep: PipelineStep = {
  accepts: ['json'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'json') {
      return { ok: false, error: { message: 'NanoID Generator expects JSON input.', kind: 'invalid-input' } };
    }

    try {
      const result = generateNanoIds(1, 21, '');
      if (!result.ok) {
        return { ok: false, error: { message: result.error, kind: 'execution-error' } };
      }

      return { ok: true, output: { type: 'text', value: result.values[0] } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Failed to generate NanoID.', kind: 'execution-error' } };
    }
  },
};
