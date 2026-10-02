import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { exploreIpv6 } from "./ipv6-explorer-logic.js";

/**
 * Pipeline-step adapter for the IPv6 Explorer tool. Renders the exploration result as `text` —
 * matching the tool's declared `produces: ['text']` — since `exploreIpv6` returns a structured
 * object with no string form of its own.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'IPv6 Explorer expects text input.', kind: 'invalid-input' } };
    }

    const result = exploreIpv6(input.value);
    if (!result) {
      return { ok: false, error: { message: `"${input.value}" is not a valid IPv6 address.`, kind: 'invalid-input' } };
    }

    const lines = [
      `Compressed: ${result.compressed}`,
      `Expanded: ${result.expanded}`,
      `Classification: ${result.classification}`,
      ...(result.embeddedIpv4 ? [`Embedded IPv4: ${result.embeddedIpv4}`] : []),
    ];

    return { ok: true, output: { type: 'text', value: lines.join('\n') } };
  },
};
