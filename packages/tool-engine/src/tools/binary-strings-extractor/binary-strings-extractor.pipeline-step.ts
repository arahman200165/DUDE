import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { extractStringsReport } from "./binary-strings-extractor-logic.js";

/**
 * Pipeline-step adapter for the Binary Strings Extractor tool. Uses the component's own
 * defaults (minLength 4, both ASCII and UTF-16LE) -- until per-step params ship (DUDE_PRD.md §21
 * Item 2, v1.1) a pipeline step can't expose these as per-run options. Runs on the main thread,
 * not via its `.worker.ts` variant.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['file'],
  produces: ['table'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'file') {
      return { ok: false, error: { message: 'Binary Strings Extractor expects file input.', kind: 'invalid-input' } };
    }

    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(input.value.base64.trim()), (char) => char.charCodeAt(0));
    } catch {
      return { ok: false, error: { message: 'File content is not valid Base64.', kind: 'invalid-input' } };
    }

    const report = extractStringsReport(bytes, { minLength: 4, includeAscii: true, includeUtf16Le: true });
    return {
      ok: true,
      output: {
        type: 'table',
        value: {
          columns: ['offset', 'text', 'encoding'],
          rows: report.strings.map((s) => [s.offset, s.text, s.encoding]),
        },
      },
    };
  },
};
