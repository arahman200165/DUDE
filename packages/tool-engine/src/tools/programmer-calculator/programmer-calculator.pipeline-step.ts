import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { buildOperandView, computeOp, parseFlexible } from "./programmer-calculator.js";

/**
 * Pipeline-step adapter for the Programmer Calculator. Every binary op (add/sub/and/or/...) needs
 * two independent operands, so this adapter always applies the one unary op, bitwise NOT, to a
 * single parsed operand at a fixed 32-bit width (the tool's own default width). Until per-step
 * params ship (DUDE_PRD.md §21 Item 2, v1.1), a pipeline step cannot select a different op or
 * width.
 */
const WIDTH = 32;

export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Programmer Calculator expects text input.', kind: 'invalid-input' } };
    }

    const parsed = parseFlexible(input.value);
    if (!parsed.ok) {
      return { ok: false, error: { message: parsed.error, kind: 'invalid-input' } };
    }

    const result = computeOp(parsed.value, 0n, WIDTH, 'not');
    if (!result.ok) {
      return { ok: false, error: { message: result.error, kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'text', value: `0x${buildOperandView(result.value, WIDTH).hex}` } };
  },
};
