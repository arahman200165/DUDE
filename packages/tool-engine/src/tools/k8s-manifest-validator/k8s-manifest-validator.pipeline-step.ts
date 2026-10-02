import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { formatK8sManifest } from "./k8s-manifest-validator-logic.js";

/**
 * Pipeline-step adapter for the Kubernetes Manifest YAML Validator / Formatter tool. Produces
 * the reformatted manifest YAML — matching the tool's declared `produces: ['text']` — rather
 * than the required-field validation issue list, which is structurally `json`, not `text`.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'K8s Manifest Validator expects text input.', kind: 'invalid-input' } };
    }

    const result = formatK8sManifest(input.value);
    return result.ok
      ? { ok: true, output: { type: 'text', value: result.output } }
      : { ok: false, error: { message: result.error, kind: 'invalid-input' } };
  },
};
