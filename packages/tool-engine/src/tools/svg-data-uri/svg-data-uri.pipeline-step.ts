import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { encodeSvgDataUri } from "./svg-data-uri-codec.js";

/**
 * Pipeline-step adapter for the SVG ↔ Data URI tool. Always encodes — matching the tool's own
 * default direction (its `direction` signal defaults to `'encode'`) — producing the Base64
 * form, the universally-safe of the two data URI encodings the tool offers.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'SVG ↔ Data URI expects text input.', kind: 'invalid-input' } };
    }
    if (input.value.trim() === '') {
      return { ok: false, error: { message: 'Enter SVG markup to encode.', kind: 'invalid-input' } };
    }

    const result = encodeSvgDataUri(input.value);
    return { ok: true, output: { type: 'text', value: result.base64Encoded } };
  },
};
