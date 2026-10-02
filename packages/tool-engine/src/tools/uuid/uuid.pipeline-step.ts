import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { generateUuidV4 } from "./uuid-tool.js";

/**
 * Pipeline-step adapter for the UUID Generator / Inspector tool. Representative of
 * a generator-style tool with no meaningful input (like the tool's own default
 * v4-generation action): the flowing value is ignored and a fresh v4 UUID is
 * always produced. Declared `produces` is narrowed to `text` — the tool's inspect
 * mode (`json` output) and bulk-export (`file` output) aren't wired into this
 * generate-only adapter.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'UUID Generator / Inspector expects text input.', kind: 'invalid-input' } };
    }

    try {
      return { ok: true, output: { type: 'text', value: generateUuidV4() } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Failed to generate UUID.', kind: 'execution-error' } };
    }
  },
};
