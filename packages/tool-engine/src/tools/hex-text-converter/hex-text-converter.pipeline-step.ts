import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { convertHexText } from "./hex-text-convert.js";

/**
 * Pipeline-step adapter for the Hex <-> Text Converter tool. Always converts hex to text (UTF-8) —
 * matches the base64 reference adapter's "always decode" convention. Until per-step params ship
 * (DUDE_PRD.md §21 Item 2, v1.1), a pipeline step cannot select the reverse direction or a
 * different text encoding.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Hex <-> Text Converter expects text input.', kind: 'invalid-input' } };
    }

    const result = convertHexText(input.value, 'toText', 'utf8');
    return result.ok
      ? { ok: true, output: { type: 'text', value: result.value } }
      : { ok: false, error: { message: result.error, kind: 'invalid-input' } };
  },
};
