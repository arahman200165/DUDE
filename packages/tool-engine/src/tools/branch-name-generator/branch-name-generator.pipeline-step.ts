import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { generateBranchName } from "./branch-name-generator-logic.js";

/**
 * Pipeline-step adapter for the Branch Name Generator tool. Treats the flowing
 * text as the description, with the tool's own defaults for the rest (type
 * `'feature'`, no ticket, no max length) — until per-step params ship
 * (DUDE_PRD.md §21 Item 2, v1.1), a pipeline step has no slot for them.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Branch Name Generator expects text input.', kind: 'invalid-input' } };
    }

    try {
      const value = generateBranchName({ type: 'feature', ticket: '', description: input.value, maxLength: 0 });
      return { ok: true, output: { type: 'text', value } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Failed to generate branch name.', kind: 'execution-error' } };
    }
  },
};
