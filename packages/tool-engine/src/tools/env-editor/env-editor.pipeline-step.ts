import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { parseEnv, serializeEnv } from "./env-format.js";

/**
 * Pipeline-step adapter for the .env Editor tool. Round-trips the input through
 * `parseEnv`/`serializeEnv` to normalize quoting — this tool's declared `io` also lists `file`
 * as a producible type, but `env-format.ts` has no file-wrapping logic of its own (the
 * component's Save button only wraps the same string in a `Blob` at the UI layer), so this
 * adapter honestly produces `text` only.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: '.env Editor expects text input.', kind: 'invalid-input' } };
    }

    try {
      return { ok: true, output: { type: 'text', value: serializeEnv(parseEnv(input.value)) } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Failed to normalize .env text.', kind: 'execution-error' } };
    }
  },
};
