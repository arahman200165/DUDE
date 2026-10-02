import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { inspectMac } from "./mac-address-inspector-logic.js";

/**
 * Pipeline-step adapter for the MAC Address Inspector tool. Renders the inspection result as
 * `text` — matching the tool's declared `produces: ['text']` — since `inspectMac` returns a
 * structured object with no string form of its own.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'MAC Address Inspector expects text input.', kind: 'invalid-input' } };
    }

    const result = inspectMac(input.value);
    if (!result) {
      return { ok: false, error: { message: `"${input.value}" is not a valid MAC address.`, kind: 'invalid-input' } };
    }

    const lines = [
      `Colon: ${result.colon}`,
      `Hyphen: ${result.hyphen}`,
      `Cisco-dotted: ${result.ciscoDotted}`,
      `Plain: ${result.plain}`,
      `Multicast: ${result.isMulticast}`,
      `Locally administered: ${result.isLocallyAdministered}`,
      ...(result.vendor ? [`Vendor: ${result.vendor}`] : []),
    ];

    return { ok: true, output: { type: 'text', value: lines.join('\n') } };
  },
};
