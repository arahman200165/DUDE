import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { processXml } from "./xml-format.js";

/**
 * Pipeline-step adapter for the XML Formatter tool. Always formats (pretty-prints) with a
 * 2-space indent — matches the tool's own default mode. Until per-step params ship
 * (DUDE_PRD.md §21 Item 2, v1.1), a pipeline step cannot select minify/validate instead.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'XML Formatter expects text input.', kind: 'invalid-input' } };
    }

    const result = processXml(input.value, 'format', 2);
    return result.ok
      ? { ok: true, output: { type: 'text', value: result.output } }
      : { ok: false, error: { message: result.error.message, kind: 'invalid-input' } };
  },
};
