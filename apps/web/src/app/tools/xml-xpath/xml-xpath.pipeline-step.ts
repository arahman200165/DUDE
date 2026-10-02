import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { evaluateXPath } from './xml-xpath-eval';

/**
 * Pipeline-step adapter for the XML XPath Tester tool. The expression is a small config value
 * alongside the flowing XML document (like `csv-viewer`'s delimiter), not a second document —
 * fixed to `//*` (every element in the document), a universally sensible default for any
 * well-formed XML, unlike the tool's own empty-string default which `evaluateXPath` rejects
 * outright. Until per-step params ship (DUDE_PRD.md §21 Item 2, v1.1), a pipeline step cannot
 * select a different expression.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'XML XPath Tester expects text input.', kind: 'invalid-input' } };
    }

    const result = evaluateXPath(input.value, '//*');
    if (!result.ok) {
      return { ok: false, error: { message: result.error.message, kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'text', value: result.result.matches.join('\n') } };
  },
};
