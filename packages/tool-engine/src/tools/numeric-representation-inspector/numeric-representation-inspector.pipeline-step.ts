import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { inspectInteger } from "./numeric-representation.js";

/**
 * Pipeline-step adapter for the Numeric Representation Inspector. Only its Integer
 * Representation mode (`inspectInteger`) takes a single input value — Endianness
 * (`inspectEndianness`) and IEEE-754 (`inspectIeee754`) also need a separate bit-width/precision
 * selector alongside the value, so they aren't wired into this adapter. Until per-step params
 * ship (DUDE_PRD.md §21 Item 2, v1.1), a pipeline step cannot select those modes.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Numeric Representation Inspector expects text input.', kind: 'invalid-input' } };
    }

    const result = inspectInteger(input.value);
    if (!result.ok) {
      return { ok: false, error: { message: result.error, kind: 'invalid-input' } };
    }

    return {
      ok: true,
      output: { type: 'json', value: result.value.map((row) => ({ ...row, unsignedValue: row.unsignedValue.toString(), signedValue: row.signedValue.toString() })) },
    };
  },
};
