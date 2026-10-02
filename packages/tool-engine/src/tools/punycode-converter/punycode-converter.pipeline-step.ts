import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { convertPunycode } from "./punycode-convert.js";

/**
 * Pipeline-step adapter for the Punycode Converter tool. Always converts Unicode to ASCII
 * ("xn--..." form) — the tool's own default direction. `url` input is accepted since its
 * `PipelineValue` shape is a bare string, same as `text`; declared `io` also lists `url` as a
 * produced type (for round-tripping a URL through the pipeline), but this adapter always emits a
 * plain `text` value since `convertPunycode` returns a domain name, not a full URL.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text', 'url'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text' && input.type !== 'url') {
      return { ok: false, error: { message: 'Punycode Converter expects text or url input.', kind: 'invalid-input' } };
    }

    const result = convertPunycode(input.value, 'toASCII');
    return result.ok
      ? { ok: true, output: { type: 'text', value: result.value } }
      : { ok: false, error: { message: result.error, kind: 'invalid-input' } };
  },
};
