import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { inspectKubeconfig } from "./kubeconfig-inspector-logic.js";

/**
 * Pipeline-step adapter for the kubeconfig Inspector tool. Note this deliberately does not
 * redact secret fields (unlike the tool's own UI, which redacts behind a reveal toggle) — a
 * pipeline step has no such toggle, and downstream steps need the real values to be useful.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'kubeconfig Inspector expects text input.', kind: 'invalid-input' } };
    }

    const result = inspectKubeconfig(input.value);
    return result.ok
      ? { ok: true, output: { type: 'json', value: result.summary } }
      : { ok: false, error: { message: result.error, kind: 'invalid-input' } };
  },
};
