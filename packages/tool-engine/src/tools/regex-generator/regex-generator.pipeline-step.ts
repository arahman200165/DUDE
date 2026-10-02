import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { generateHeuristicRegex } from "./regex-generate.js";

/**
 * Pipeline-step adapter for the Regex Generator tool. Treats each non-blank line
 * of the flowing text as one example and generalizes a pattern from them — no
 * counter-examples, since the contract carries only one input until per-step
 * params ship (DUDE_PRD.md §21 Item 2, v1.1).
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Regex Generator expects text input.', kind: 'invalid-input' } };
    }

    try {
      const examples = input.value.split('\n');
      const result = generateHeuristicRegex(examples, []);
      if (!result.ok) {
        return { ok: false, error: { message: result.error, kind: 'invalid-input' } };
      }

      return { ok: true, output: { type: 'text', value: result.pattern } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Failed to generate pattern.', kind: 'execution-error' } };
    }
  },
};
