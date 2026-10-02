import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { convertIpv4Integer } from "./ipv4-integer-converter-logic.js";

/**
 * Pipeline-step adapter for the IPv4 ↔ Integer Converter tool. Always converts IP -> integer
 * (the tool's own default direction) — until per-step params ship (DUDE_PRD.md §21 Item 2,
 * v1.1), a pipeline step cannot select the reverse direction.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'IPv4 ↔ Integer Converter expects text input.', kind: 'invalid-input' } };
    }

    const result = convertIpv4Integer(input.value, 'ip-to-int');
    return result.ok
      ? { ok: true, output: { type: 'text', value: result.output } }
      : { ok: false, error: { message: result.error, kind: 'invalid-input' } };
  },
};
