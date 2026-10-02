import { PipelineStep, PipelineStepResult } from "@dude/contracts/shared/models/pipeline-step.model";
import { generateGradient } from "./gradient-generator-logic.js";

/**
 * Pipeline-step adapter for the Gradient Generator — a generator-style step with no meaningful
 * input (DUDE_PRD.md §21 Item 2's pipeline batch migration guidance): a gradient needs an
 * ordered list of color stops, which doesn't fit a single piped value, so the piped value is
 * ignored and the tool's own initial defaults (a two-stop 90deg linear gradient) are used.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(): Promise<PipelineStepResult> {
    const result = generateGradient({
      type: 'linear',
      angle: 90,
      shape: 'circle',
      stops: [
        { color: '#3b82f6', position: 0 },
        { color: '#a855f7', position: 100 },
      ],
    });

    return result.ok
      ? { ok: true, output: { type: 'text', value: result.css } }
      : { ok: false, error: { message: result.error, kind: 'execution-error' } };
  },
};
