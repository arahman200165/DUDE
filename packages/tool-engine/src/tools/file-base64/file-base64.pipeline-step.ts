import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { decodeBase64ToBytes } from "./file-base64-codec.js";
import { sniffFileType } from "./file-signature.js";

/**
 * Pipeline-step adapter for the File Base64 Converter, bidirectional like
 * the tool itself: a `file` value encodes to `text` (its Base64 is simply
 * re-exposed — `PipelineValue`'s own `file` shape already carries Base64,
 * per `pipeline-step.model.ts`), and a `text` value decodes to a `file`
 * value, sniffing the MIME type/extension from the decoded bytes exactly as
 * `file-base64.ts`'s own decode direction does.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['file', 'text'],
  produces: ['text', 'file'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type === 'file') {
      return { ok: true, output: { type: 'text', value: input.value.base64 } };
    }

    if (input.type !== 'text') {
      return { ok: false, error: { message: 'File Base64 Converter expects file or text input.', kind: 'invalid-input' } };
    }

    const decoded = decodeBase64ToBytes(input.value);
    if (!decoded.ok) {
      return { ok: false, error: { message: decoded.error, kind: 'invalid-input' } };
    }

    const sniffed = sniffFileType(decoded.bytes);
    return {
      ok: true,
      output: {
        type: 'file',
        value: {
          name: sniffed ? `decoded.${sniffed.extension}` : 'decoded.bin',
          mimeType: sniffed?.mime ?? 'application/octet-stream',
          base64: input.value.trim(),
        },
      },
    };
  },
};
