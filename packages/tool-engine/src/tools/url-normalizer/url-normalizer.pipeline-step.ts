import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { DEFAULT_NORMALIZE_OPTIONS, normalizeUrl } from "./url-normalize.js";

/**
 * Pipeline-step adapter for the URL Normalizer & Comparator tool. Only `normalizeUrl` takes a
 * single input value; `resolveUrl` (base + relative) and `compareUrls` (two URLs) are each
 * inherently two-input, so this adapter always normalizes with the tool's own default options.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['url'],
  produces: ['url'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'url') {
      return { ok: false, error: { message: 'URL Normalizer expects url input.', kind: 'invalid-input' } };
    }

    const result = normalizeUrl(input.value, DEFAULT_NORMALIZE_OPTIONS);
    if (!result.ok) {
      return { ok: false, error: { message: result.error, kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'url', value: result.normalized } };
  },
};
