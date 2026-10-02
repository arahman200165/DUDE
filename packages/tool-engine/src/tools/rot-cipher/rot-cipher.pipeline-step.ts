import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { applyRot } from "./rot-cipher.js";

/**
 * Pipeline-step adapter for the ROT13 / ROT47 Cipher tool. Always applies ROT13 — the tool's own
 * default mode. Both modes are self-inverse, so running this step twice on its own output returns
 * the original text. Until per-step params ship (DUDE_PRD.md §21 Item 2, v1.1), a pipeline step
 * cannot select ROT47.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'ROT13 / ROT47 Cipher expects text input.', kind: 'invalid-input' } };
    }

    try {
      return { ok: true, output: { type: 'text', value: applyRot(input.value, 'rot13') } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Failed to apply the cipher.', kind: 'execution-error' } };
    }
  },
};
