import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { generateSnowflake, SNOWFLAKE_PRESETS } from "./snowflake-logic.js";

/**
 * Pipeline-step adapter for the Snowflake ID Generator / Inspector tool.
 * Generator-style with no meaningful input: the flowing value is ignored and a
 * fresh id is always produced under the Twitter/X preset with worker id 1.
 * Declared `produces` is narrowed to `text` — the tool's inspect mode (`json`
 * output) isn't wired into this generate-only adapter.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Snowflake ID Generator / Inspector expects text input.', kind: 'invalid-input' } };
    }

    try {
      const result = generateSnowflake(SNOWFLAKE_PRESETS.twitter, 1);
      if (!result.ok) {
        return { ok: false, error: { message: result.error, kind: 'execution-error' } };
      }

      return { ok: true, output: { type: 'text', value: result.id } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Failed to generate Snowflake id.', kind: 'execution-error' } };
    }
  },
};
