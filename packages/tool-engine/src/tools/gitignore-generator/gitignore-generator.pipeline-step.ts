import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { combineGitignoreTemplates } from "./gitignore-generator-logic.js";

/**
 * Pipeline-step adapter for the Gitignore Generator tool. The flowing JSON value
 * is the array of selected template ids; falls back to the tool's own default
 * (`['node']`) when it isn't a string array. Declared `produces` is narrowed to
 * `text` — the tool's `file` capability is just this same text handed to a
 * browser download, not a distinct generation capability.
 */
function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export const pipelineStep: PipelineStep = {
  accepts: ['json'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'json') {
      return { ok: false, error: { message: 'Gitignore Generator expects JSON input.', kind: 'invalid-input' } };
    }

    try {
      const ids = isStringArray(input.value) && input.value.length > 0 ? input.value : ['node'];
      return { ok: true, output: { type: 'text', value: combineGitignoreTemplates(ids) } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Failed to combine templates.', kind: 'execution-error' } };
    }
  },
};
