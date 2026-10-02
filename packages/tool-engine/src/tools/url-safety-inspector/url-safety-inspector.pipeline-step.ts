import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { inspectUrlSafety } from "./url-safety-inspect.js";

/** Pipeline-step adapter for the URL Safety Inspector tool. */
export const pipelineStep: PipelineStep = {
  accepts: ['url'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'url') {
      return { ok: false, error: { message: 'URL Safety Inspector expects url input.', kind: 'invalid-input' } };
    }

    const result = inspectUrlSafety(input.value);
    if (!result.ok) {
      return { ok: false, error: { message: result.error, kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'json', value: { url: result.url, hostname: result.hostname, findings: result.findings, homograph: result.homograph } } };
  },
};
