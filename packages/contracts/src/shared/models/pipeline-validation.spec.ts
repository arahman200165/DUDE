import { describe, expect, it } from 'vitest';
import { PipelineStep, PipelineStepResult, PipelineValue } from "./pipeline-step.model.js";
import { validatePipelineChain } from "@dude/validation/core/pipeline/pipeline-validation";

function stubStep(accepts: PipelineStep['accepts'], produces: PipelineStep['produces']): PipelineStep {
  return {
    accepts,
    produces,
    async run(): Promise<PipelineStepResult> {
      return { ok: true, output: { type: produces[0], value: '' } as PipelineValue };
    },
  };
}

describe('validatePipelineChain', () => {
  it('is valid for a fully compatible chain', () => {
    const result = validatePipelineChain('text', [
      { stepId: 'a', step: stubStep(['text'], ['json']) },
      { stepId: 'b', step: stubStep(['json'], ['table']) },
    ]);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('flags a type mismatch between steps', () => {
    const result = validatePipelineChain('text', [
      { stepId: 'a', step: stubStep(['text'], ['text']) },
      { stepId: 'b', step: stubStep(['table'], ['json']) },
    ]);
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].stepId).toBe('b');
  });

  it('flags a missing step and does not cascade a false positive past it', () => {
    const result = validatePipelineChain('text', [
      { stepId: 'a', step: undefined },
      { stepId: 'b', step: stubStep(['json'], ['table']) },
    ]);
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.stepId)).toEqual(['a']);
  });

  it('flags a mismatch against the initial input type on the first step', () => {
    const result = validatePipelineChain('table', [{ stepId: 'a', step: stubStep(['text'], ['json']) }]);
    expect(result.valid).toBe(false);
  });
});
