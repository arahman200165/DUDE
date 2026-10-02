import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { renderAsciiArt } from "./ascii-art-render.js";

/**
 * Pipeline-step adapter for the ASCII Art Generator / Banner tool. Always renders with the
 * "Standard" figlet font (the component's own default) until per-step params ship (DUDE_PRD.md
 * §21 Item 2, v1.1).
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'ASCII Art Generator expects text input.', kind: 'invalid-input' } };
    }

    try {
      return { ok: true, output: { type: 'text', value: renderAsciiArt(input.value, 'Standard') } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : String(error), kind: 'execution-error' } };
    }
  },
};
