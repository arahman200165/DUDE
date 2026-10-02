import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { formatHexDump } from "./hex-dump-codec.js";

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64.trim());
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/**
 * Pipeline-step adapter for the Hex Dump Viewer / Builder tool. Always renders bytes as a hex
 * dump (the Viewer direction) — the reverse (`parseHexDump`, rebuilding bytes from pasted hex
 * dump text) isn't wired into this adapter. Declared `io` also lists `file`/`bytes` as produced
 * types (for that reverse direction); this adapter's honest capability is render-only. Runs
 * `formatHexDump` directly rather than through `hex-dump.worker.ts`, per the pipeline-step
 * migration's worker policy.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['file', 'bytes'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'file' && input.type !== 'bytes') {
      return { ok: false, error: { message: 'Hex Dump Viewer / Builder expects file or bytes input.', kind: 'invalid-input' } };
    }

    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(input.type === 'file' ? input.value.base64 : input.value);
    } catch {
      return { ok: false, error: { message: 'Input is not valid Base64.', kind: 'invalid-input' } };
    }

    try {
      return { ok: true, output: { type: 'text', value: formatHexDump(bytes) } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Failed to render hex dump.', kind: 'execution-error' } };
    }
  },
};
