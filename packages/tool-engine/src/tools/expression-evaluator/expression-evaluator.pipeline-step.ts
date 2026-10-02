import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { evaluateExpression } from "./expression-evaluate.js";

/**
 * Pipeline-step adapter for the Expression Evaluator tool. `evaluateExpression` takes a single
 * input value (the expression string) plus an optional variable scope, which defaults to an
 * empty object here — until per-step params ship (DUDE_PRD.md §21 Item 2, v1.1), a pipeline step
 * cannot supply a populated scope.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Expression Evaluator expects text input.', kind: 'invalid-input' } };
    }

    const result = evaluateExpression(input.value, {});
    return result.ok
      ? { ok: true, output: { type: 'text', value: result.value } }
      : { ok: false, error: { message: result.error, kind: 'invalid-input' } };
  },
};
