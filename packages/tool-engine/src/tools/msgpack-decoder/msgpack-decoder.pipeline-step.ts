import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { decodeMsgpack } from "./msgpack-decode.js";

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64.trim());
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/**
 * Pipeline-step adapter for the MessagePack Decoder tool. Accepts either a `file` value (the
 * uploaded MessagePack file) or a bare `bytes` value (both are Base64 text per
 * `pipeline-step.model.ts`), decodes it synchronously with the same `decodeMsgpack` the component
 * uses, and passes the decoded value through as a `json` value.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['file', 'bytes'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'file' && input.type !== 'bytes') {
      return { ok: false, error: { message: 'MessagePack Decoder expects file or bytes input.', kind: 'invalid-input' } };
    }

    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(input.type === 'file' ? input.value.base64 : input.value);
    } catch {
      return { ok: false, error: { message: 'Input is not valid Base64.', kind: 'invalid-input' } };
    }

    try {
      const result = decodeMsgpack(bytes);
      if (!result.ok) {
        return { ok: false, error: { message: result.error.message, kind: 'invalid-input' } };
      }
      return { ok: true, output: { type: 'json', value: result.value } };
    } catch (error) {
      return {
        ok: false,
        error: { message: error instanceof Error ? error.message : 'Failed to decode MessagePack.', kind: 'execution-error' },
      };
    }
  },
};
