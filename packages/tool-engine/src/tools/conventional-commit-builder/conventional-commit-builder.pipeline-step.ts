import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { buildConventionalCommit } from "./conventional-commit-builder-logic.js";

/**
 * Pipeline-step adapter for the Conventional Commit Builder tool. Treats the
 * flowing text as the subject, with the tool's own defaults for the rest (type
 * `'feat'`, no scope, not breaking, no body/footers) — until per-step params
 * ship (DUDE_PRD.md §21 Item 2, v1.1), a pipeline step has no slot for them.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Conventional Commit Builder expects text input.', kind: 'invalid-input' } };
    }

    try {
      const value = buildConventionalCommit({
        type: 'feat',
        scope: '',
        breaking: false,
        subject: input.value,
        body: '',
        breakingDescription: '',
        footers: '',
      });
      return { ok: true, output: { type: 'text', value } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Failed to build commit message.', kind: 'execution-error' } };
    }
  },
};
