import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { splitSubnet } from "./subnet-calculator-logic.js";

/**
 * Pipeline-step adapter for the Subnet Calculator tool. Always splits into the tool's own
 * default of 4 equal subnets — until per-step params ship (DUDE_PRD.md §21 Item 2, v1.1), a
 * pipeline step cannot choose a different split count or mode.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['table'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Subnet Calculator expects text input.', kind: 'invalid-input' } };
    }

    const result = splitSubnet(input.value, 'count', 4);
    if (!result.ok) {
      return { ok: false, error: { message: result.error, kind: 'invalid-input' } };
    }

    return {
      ok: true,
      output: {
        type: 'table',
        value: {
          columns: ['network', 'broadcast', 'usableRange', 'usableHosts'],
          rows: result.subnets.map((subnet) => [
            `${subnet.network}/${subnet.prefixLength}`,
            subnet.broadcast,
            `${subnet.firstUsable} - ${subnet.lastUsable}`,
            subnet.usableHosts,
          ]),
        },
      },
    };
  },
};
