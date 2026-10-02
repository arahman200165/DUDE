import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { convertXmlCsv } from "./xml-csv-transform.js";

/**
 * Pipeline-step adapter for the XML <-> CSV Converter tool. Always converts XML -> CSV (the
 * tool's own default direction) with the tool's own default record-element value (an empty
 * string, meaning "auto-detect the repeating element"). `convertXmlCsv` only ever produces a
 * plain CSV string, so `produces` is narrowed to `text` here rather than the declared registry
 * `io`'s `['text', 'table']`.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'XML ↔ CSV Converter expects text input.', kind: 'invalid-input' } };
    }

    const result = convertXmlCsv(input.value, 'xml-to-csv', '');
    if (!result.ok) {
      return { ok: false, error: { message: result.error.message, kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'text', value: result.output } };
  },
};
