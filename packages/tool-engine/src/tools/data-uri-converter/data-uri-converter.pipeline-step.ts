import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { generateDataUri } from "./data-uri-codec.js";

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64.trim());
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/**
 * Pipeline-step adapter for the Data URI Converter tool. Always generates a `data:` URI (RFC
 * 2397) from bytes — the decode direction (`decodeDataUri`) needs only a single `text` input too,
 * but generate is chosen here since it needs no second freeform input: a `file` value already
 * carries its own MIME type, and a bare `bytes` value falls back to
 * `application/octet-stream`, exactly like the tool's own default when no MIME type is known.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['file', 'bytes'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'file' && input.type !== 'bytes') {
      return { ok: false, error: { message: 'Data URI Converter expects file or bytes input.', kind: 'invalid-input' } };
    }

    const mimeType = input.type === 'file' ? input.value.mimeType : 'application/octet-stream';
    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(input.type === 'file' ? input.value.base64 : input.value);
    } catch {
      return { ok: false, error: { message: 'Input is not valid Base64.', kind: 'invalid-input' } };
    }

    try {
      return { ok: true, output: { type: 'text', value: generateDataUri(bytes, mimeType) } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Failed to generate data URI.', kind: 'execution-error' } };
    }
  },
};
