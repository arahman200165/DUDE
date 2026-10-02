import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { decodeToBytes } from "./base-n-codec.js";

function bytesToTextUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/**
 * Pipeline-step adapter for the Base-N Encoder / Decoder tool. Always decodes Base58 text back to
 * UTF-8 text — Base58 is the tool's own default mode (`base-n-encoder.ts`), and decoding matches
 * the base64 reference adapter's "always decode" convention. Until per-step params ship
 * (DUDE_PRD.md §21 Item 2, v1.1), a pipeline step cannot select a different base or the encode
 * direction.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Base-N Encoder / Decoder expects text input.', kind: 'invalid-input' } };
    }

    const decoded = decodeToBytes(input.value, 'base58');
    if (!decoded.ok) {
      return { ok: false, error: { message: decoded.error, kind: 'invalid-input' } };
    }

    try {
      return { ok: true, output: { type: 'text', value: bytesToTextUtf8(decoded.value) } };
    } catch {
      return { ok: false, error: { message: 'Decoded bytes are not valid UTF-8.', kind: 'invalid-input' } };
    }
  },
};
