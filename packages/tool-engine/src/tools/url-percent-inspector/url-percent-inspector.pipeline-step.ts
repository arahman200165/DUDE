import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { inspectPercentEncoding } from "./percent-encoding-inspect.js";

/**
 * Pipeline-step adapter for the URL Percent-Encoding Inspector. `inspectPercentEncoding` already
 * takes a single input value and returns a rich, tool-specific result object, so this adapter's
 * job is just normalizing that object into a `json` value (representative of the `jwt`-style
 * adapter shape). `url` input is accepted since its `PipelineValue` shape is a bare string, same
 * as `text`.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text', 'url'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text' && input.type !== 'url') {
      return { ok: false, error: { message: 'URL Percent-Encoding Inspector expects text or url input.', kind: 'invalid-input' } };
    }

    try {
      const inspection = inspectPercentEncoding(input.value);
      if (inspection.error) {
        return { ok: false, error: { message: inspection.error, kind: 'invalid-input' } };
      }
      return { ok: true, output: { type: 'json', value: { segments: inspection.segments, decoded: inspection.decoded } } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Failed to inspect input.', kind: 'execution-error' } };
    }
  },
};
