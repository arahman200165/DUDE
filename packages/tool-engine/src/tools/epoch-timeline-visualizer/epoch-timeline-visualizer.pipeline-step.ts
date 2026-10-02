import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { parseMultiTimestamps } from "./epoch-timeline-visualizer-logic.js";

/**
 * Pipeline-step adapter for the Epoch Timeline Visualizer — always the
 * multi-timestamp mode (one `<timestamp>` or `<timestamp> | <label>` per
 * line), never the range mode (which takes two separate start/end fields).
 * "Now" is never injected, so the output only reflects the piped timestamps.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Epoch Timeline Visualizer expects text input.', kind: 'invalid-input' } };
    }

    const result = parseMultiTimestamps(input.value, false, Date.now());
    if (!result.ok) {
      return { ok: false, error: { message: result.error, kind: 'invalid-input' } };
    }

    return {
      ok: true,
      output: { type: 'json', value: { markers: result.markers, rangeStartMs: result.rangeStartMs, rangeEndMs: result.rangeEndMs } },
    };
  },
};
