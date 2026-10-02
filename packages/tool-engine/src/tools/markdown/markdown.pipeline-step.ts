import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { renderMarkdown } from "./markdown-render.js";

/** Pipeline-step adapter for the Markdown Preview tool — renders Markdown to sanitized HTML text. */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Markdown Preview expects text input.', kind: 'invalid-input' } };
    }

    try {
      return { ok: true, output: { type: 'text', value: renderMarkdown(input.value) } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Failed to render Markdown.', kind: 'execution-error' } };
    }
  },
};
