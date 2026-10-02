import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { generateUlid } from "./ulid-logic.js";

/**
 * Pipeline-step adapter for the ULID Generator / Inspector tool. Generator-style
 * with no meaningful input: the flowing value is ignored and a fresh (non-monotonic)
 * ULID is always produced. Declared `produces` is narrowed to `text` — the tool's
 * inspect mode (`json` output) isn't wired into this generate-only adapter.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'ULID Generator / Inspector expects text input.', kind: 'invalid-input' } };
    }

    try {
      return { ok: true, output: { type: 'text', value: generateUlid(false) } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Failed to generate ULID.', kind: 'execution-error' } };
    }
  },
};
