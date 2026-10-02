import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { detectBom } from "../../shared/utils/encoding-detection.js";

/**
 * Pipeline-step adapter for the BOM Detector / Remover tool.
 *
 * Drift from the declared `io` in tool-definitions.ts: it lists `produces: ['json', 'file']`,
 * covering both the detection report (json) and the "download without BOM" side action (file).
 * This adapter only implements the detection direction, honestly producing just `['json']` --
 * per this batch's forensics-tool guidance, structured JSON findings are preferred over a
 * formatted report, and stripping is a side action rather than the tool's core transform.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['file'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'file') {
      return { ok: false, error: { message: 'BOM Detector / Remover expects file input.', kind: 'invalid-input' } };
    }

    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(input.value.base64.trim()), (char) => char.charCodeAt(0));
    } catch {
      return { ok: false, error: { message: 'File content is not valid Base64.', kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'json', value: { fileName: input.value.name, byteLength: bytes.length, bom: detectBom(bytes) } } };
  },
};
