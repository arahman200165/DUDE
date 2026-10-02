import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { formatDockerfile } from "./dockerfile-linter-logic.js";

/**
 * Pipeline-step adapter for the Dockerfile Linter / Formatter tool. Produces the reformatted
 * Dockerfile text (normalized instruction casing) — matching the tool's declared `produces:
 * ['text']` — rather than the lint issue list, which has no `text` shape of its own.
 * `formatDockerfile` never fails (it's a line-by-line normalization), so this step never
 * returns an error for well-formed text input.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Dockerfile Linter / Formatter expects text input.', kind: 'invalid-input' } };
    }

    try {
      return { ok: true, output: { type: 'text', value: formatDockerfile(input.value) } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Failed to format Dockerfile.', kind: 'execution-error' } };
    }
  },
};
