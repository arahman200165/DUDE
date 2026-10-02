import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { generateKsuid } from "./ksuid-logic.js";

/**
 * Pipeline-step adapter for the KSUID Generator / Inspector tool. Generator-style
 * with no meaningful input: the flowing value is ignored and a fresh KSUID is
 * always produced. Declared `produces` is narrowed to `text` — the tool's inspect
 * mode (`json` output) isn't wired into this generate-only adapter.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'KSUID Generator / Inspector expects text input.', kind: 'invalid-input' } };
    }

    try {
      return { ok: true, output: { type: 'text', value: generateKsuid() } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Failed to generate KSUID.', kind: 'execution-error' } };
    }
  },
};
