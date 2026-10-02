import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { decodeBase64 } from "@dude/crypto/base64-codec";

/**
 * Pipeline-step adapter for the Base64 tool. Always decodes — matches the direction of the
 * PRD's own worked pipeline example ("Base64 Decode -> Gunzip -> ..."). Until per-step params
 * ship (DUDE_PRD.md §21 Item 2, v1.1), a pipeline step cannot select encode instead of decode.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Base64 Decoder expects text input.', kind: 'invalid-input' } };
    }

    const result = decodeBase64(input.value);
    return result.ok
      ? { ok: true, output: { type: 'text', value: result.value } }
      : { ok: false, error: { message: result.error, kind: 'invalid-input' } };
  },
};
