import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { encodeSecretData, toSecretDataYaml } from "./k8s-secret-base64-logic.js";

/**
 * Pipeline-step adapter for the Kubernetes Base64 Secret Encoder / Decoder tool. This tool's
 * real input is a list of key/value pairs edited in a dedicated UI, not free-form text, so
 * there is no meaningful way to feed an upstream pipeline value into it yet (DUDE_PRD.md §21
 * Item 2, v1.1 — no per-step params). Like the PRD's own generator-style examples, this step
 * ignores its input entirely and always encodes the tool's own default sample pair — useful as
 * a first step that seeds a chain with a Secret `data:` block.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(_input: PipelineValue): Promise<PipelineStepResult> {
    const fields = encodeSecretData([{ key: 'username', value: 'admin' }]);
    return { ok: true, output: { type: 'text', value: toSecretDataYaml(fields) } };
  },
};
