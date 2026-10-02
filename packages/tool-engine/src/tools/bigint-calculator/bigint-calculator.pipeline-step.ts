import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { computeBigCalc, parseBigInt } from "./bigint-calculator.js";

/**
 * Pipeline-step adapter for the Arbitrary Precision Calculator. Every binary op
 * (add/sub/mul/div/mod/pow) needs two independent operands, so this adapter always applies the
 * one unary op, factorial, to a single parsed operand. Until per-step params ship (DUDE_PRD.md
 * §21 Item 2, v1.1), a pipeline step cannot select a different op.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Arbitrary Precision Calculator expects text input.', kind: 'invalid-input' } };
    }

    const parsed = parseBigInt(input.value);
    if (!parsed.ok) {
      return { ok: false, error: { message: parsed.error, kind: 'invalid-input' } };
    }

    const result = computeBigCalc(parsed.value, 0n, 'factorial');
    return result.ok
      ? { ok: true, output: { type: 'text', value: result.value.toString() } }
      : { ok: false, error: { message: result.error, kind: 'invalid-input' } };
  },
};
