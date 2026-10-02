import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { validateCompose } from "./docker-compose-validator-logic.js";

/**
 * Pipeline-step adapter for the Docker Compose Validator / Viewer tool. Normalizes the
 * validation issue list into a `json` value — the tool's declared `produces` also allows
 * `text`, but the validator's own result shape (a list of `{path, message}` issues) is
 * structurally a `json` value, not a string.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Docker Compose Validator expects text input.', kind: 'invalid-input' } };
    }

    const result = validateCompose(input.value);
    if (!result.ok) {
      return { ok: false, error: { message: result.error, kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'json', value: { issues: result.issues } } };
  },
};
