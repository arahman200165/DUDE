import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { formatHtml } from './html-format-logic';

/**
 * Pipeline-step adapter for the HTML Formatter / Minifier tool. Always pretty-prints — until
 * per-step params ship (DUDE_PRD.md §21 Item 2, v1.1), a pipeline step can't select the
 * minify mode.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'HTML Formatter expects text input.', kind: 'invalid-input' } };
    }

    const result = formatHtml(input.value, 'pretty');
    return result.ok
      ? { ok: true, output: { type: 'text', value: result.output } }
      : { ok: false, error: { message: result.error, kind: 'invalid-input' } };
  },
};
