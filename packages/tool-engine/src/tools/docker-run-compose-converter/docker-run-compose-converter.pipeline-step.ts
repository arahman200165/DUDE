import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { dockerRunToCompose } from "./docker-run-compose-converter-logic.js";

/**
 * Pipeline-step adapter for the Docker Run ↔ Compose Converter tool. Always converts
 * `docker run` -> compose (the tool's own default direction) with the tool's default service
 * name — until per-step params ship (DUDE_PRD.md §21 Item 2, v1.1), a pipeline step cannot
 * select the reverse direction.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Docker Run ↔ Compose Converter expects text input.', kind: 'invalid-input' } };
    }

    const result = dockerRunToCompose(input.value, 'app');
    return result.ok
      ? { ok: true, output: { type: 'text', value: result.output } }
      : { ok: false, error: { message: result.error, kind: 'invalid-input' } };
  },
};
