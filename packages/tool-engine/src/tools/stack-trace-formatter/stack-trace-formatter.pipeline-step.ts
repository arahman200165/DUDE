import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { formatStackTrace } from "./stack-trace-format.js";

/** Pipeline-step adapter for the Stack Trace Formatter tool. Always uses 'auto' language detection, matching the component's own default mode. */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Stack Trace Formatter expects text input.', kind: 'invalid-input' } };
    }

    const result = formatStackTrace(input.value, 'auto');
    return { ok: true, output: { type: 'text', value: result.trace.lines.map((line) => line.text).join('\n') } };
  },
};
