import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { gcdList } from "./number-theory.js";

/**
 * Pipeline-step adapter for the Number Theory Toolkit. Only its GCD-of-a-list mode (`gcdList`)
 * takes a single homogeneous-list input value — modular arithmetic (`modOp`/`modInverse`) needs
 * separate operand/modulus fields with distinct roles, and prime checking/factorization
 * (`checkPrime`/`factorize`) take a single number but aren't the more representative "list" shape
 * this toolkit's List Ops tab centers on. Until per-step params ship (DUDE_PRD.md §21 Item 2,
 * v1.1), a pipeline step cannot select those modes.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Number Theory Toolkit expects text input.', kind: 'invalid-input' } };
    }

    const parts = input.value
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    let values: bigint[];
    try {
      values = parts.map((part) => BigInt(part));
    } catch {
      return { ok: false, error: { message: 'Enter a comma- or whitespace-separated list of integers.', kind: 'invalid-input' } };
    }

    const result = gcdList(values);
    return result.ok
      ? { ok: true, output: { type: 'text', value: result.value.toString() } }
      : { ok: false, error: { message: result.error, kind: 'invalid-input' } };
  },
};
