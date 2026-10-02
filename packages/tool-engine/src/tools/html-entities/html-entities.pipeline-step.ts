import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { processHtmlEntities } from "./html-entity-codec.js";

/**
 * Pipeline-step adapter for the HTML Entity Encoder / Decoder tool. Always encodes, without
 * escaping non-ASCII characters (the component's own defaults), until per-step params ship
 * (DUDE_PRD.md §21 Item 2, v1.1).
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'HTML Entity Encoder / Decoder expects text input.', kind: 'invalid-input' } };
    }

    try {
      return { ok: true, output: { type: 'text', value: processHtmlEntities(input.value, 'encode', false) } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : String(error), kind: 'execution-error' } };
    }
  },
};
