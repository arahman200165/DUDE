import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { calculateCidr } from "./cidr-calculator-logic.js";

/**
 * Pipeline-step adapter for the CIDR Calculator tool. Renders the computed block info as
 * `text` — matching the tool's declared `produces: ['text']` — since `calculateCidr` returns a
 * structured object with no string form of its own.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'CIDR Calculator expects text input.', kind: 'invalid-input' } };
    }

    const result = calculateCidr(input.value);
    if (!result) {
      return { ok: false, error: { message: `"${input.value}" is not a valid IPv4 CIDR block.`, kind: 'invalid-input' } };
    }

    const lines = [
      `Network: ${result.network}/${result.prefixLength}`,
      `Broadcast: ${result.broadcast}`,
      `Netmask: ${result.netmask}`,
      `Usable range: ${result.firstUsable} - ${result.lastUsable}`,
      `Total addresses: ${result.totalAddresses}`,
      `Usable hosts: ${result.usableHosts}`,
    ];

    return { ok: true, output: { type: 'text', value: lines.join('\n') } };
  },
};
