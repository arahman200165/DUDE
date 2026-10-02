import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { decodeParquet } from "./parquet-decode.js";

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64.trim());
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/**
 * Pipeline-step adapter for the Parquet Viewer tool. Accepts either a `file` value (the uploaded
 * `.parquet` file) or a bare `bytes` value (both Base64 text per `pipeline-step.model.ts`),
 * decodes it with the same `decodeParquet` (hyparquet) the component uses, and passes its
 * `{columns, rows}` table straight through as a `table` value — it already matches the contract's
 * shape.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['file', 'bytes'],
  produces: ['table'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'file' && input.type !== 'bytes') {
      return { ok: false, error: { message: 'Parquet Viewer expects file or bytes input.', kind: 'invalid-input' } };
    }

    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(input.type === 'file' ? input.value.base64 : input.value);
    } catch {
      return { ok: false, error: { message: 'Input is not valid Base64.', kind: 'invalid-input' } };
    }

    try {
      const result = await decodeParquet(bytes);
      if (!result.ok) {
        return { ok: false, error: { message: result.error.message, kind: 'invalid-input' } };
      }
      return { ok: true, output: { type: 'table', value: result.table } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Failed to decode Parquet file.', kind: 'execution-error' } };
    }
  },
};
