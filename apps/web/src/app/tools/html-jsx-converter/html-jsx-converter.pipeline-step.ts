import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { htmlToJsx } from './html-jsx-logic';

/**
 * Pipeline-step adapter for the HTML ↔ JSX Converter tool. Always converts HTML -> JSX — until
 * per-step params ship (DUDE_PRD.md §21 Item 2, v1.1), a pipeline step can't select the
 * reverse (JSX -> HTML) direction.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'HTML ↔ JSX Converter expects text input.', kind: 'invalid-input' } };
    }

    const result = htmlToJsx(input.value);
    return result.ok
      ? { ok: true, output: { type: 'text', value: result.output } }
      : { ok: false, error: { message: result.error, kind: 'invalid-input' } };
  },
};
