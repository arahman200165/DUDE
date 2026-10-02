import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { inspectIpAddress } from "./ip-address-inspector-logic.js";

/**
 * Pipeline-step adapter for the IP Address Inspector tool. Renders the inspection result as
 * `text` — matching the tool's declared `produces: ['text']` — since `inspectIpAddress`
 * returns a structured object with no string form of its own.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'IP Address Inspector expects text input.', kind: 'invalid-input' } };
    }

    const result = inspectIpAddress(input.value);
    if (!result) {
      return { ok: false, error: { message: `"${input.value}" is not a valid IPv4 or IPv6 address.`, kind: 'invalid-input' } };
    }

    const lines = [
      `Version: IPv${result.version}`,
      `Canonical: ${result.canonical}`,
      `Classification: ${result.classification}`,
      `Expanded/Binary: ${result.expandedOrBinary}`,
      `Integer/Hex: ${result.integerOrHex}`,
    ];

    return { ok: true, output: { type: 'text', value: lines.join('\n') } };
  },
};
