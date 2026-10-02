import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { detectSecrets } from "./secret-detector-logic.js";

/**
 * Pipeline-step adapter for the Secret Detector tool. Normalizes the finding list into a
 * `json` value (matching one of the tool's two declared `produces` types) — the redacting
 * "reveal" toggle is a UI-only concern, so this step always surfaces the real matched text,
 * same as `kubeconfig-inspector`'s adapter.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Secret Detector expects text input.', kind: 'invalid-input' } };
    }

    const findings = detectSecrets(input.value);
    return { ok: true, output: { type: 'json', value: { findings } } };
  },
};
