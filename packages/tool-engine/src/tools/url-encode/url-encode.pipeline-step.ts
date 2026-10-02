import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { processUrl } from "./url-encode-codec.js";

/**
 * Pipeline-step adapter for the URL Encoder / Decoder tool. Always decodes as a URL component —
 * matches the base64 adapter's convention of picking one fixed direction until per-step params
 * ship (DUDE_PRD.md §21 Item 2, v1.1), since a pipeline step cannot yet select encode vs. decode.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'URL Encoder / Decoder expects text input.', kind: 'invalid-input' } };
    }

    const result = processUrl(input.value, 'decode', 'component');
    return result.ok
      ? { ok: true, output: { type: 'text', value: result.value } }
      : { ok: false, error: { message: result.error, kind: 'invalid-input' } };
  },
};
