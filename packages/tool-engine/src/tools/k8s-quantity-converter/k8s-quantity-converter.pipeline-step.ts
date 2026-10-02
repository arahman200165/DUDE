import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { convertQuantity } from "./k8s-quantity-converter-logic.js";

/** Pipeline-step adapter for the Kubernetes Quantity Converter tool. */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['table'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'K8s Quantity Converter expects text input.', kind: 'invalid-input' } };
    }

    const result = convertQuantity(input.value);
    if (!result.ok) {
      return { ok: false, error: { message: result.error, kind: 'invalid-input' } };
    }

    return {
      ok: true,
      output: {
        type: 'table',
        value: { columns: ['unit', 'formatted'], rows: result.conversions.map((conversion) => [conversion.unit, conversion.formatted]) },
      },
    };
  },
};
