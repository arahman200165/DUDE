import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { calculateResourceRequests } from "./k8s-resource-calculator-logic.js";

/**
 * Pipeline-step adapter for the Kubernetes Resource Requests Calculator tool. Renders the
 * summed totals as `text` — matching the tool's declared `produces: ['text']` — since the
 * underlying `ResourceTotals` object has no string form of its own.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'K8s Resource Calculator expects text input.', kind: 'invalid-input' } };
    }

    const result = calculateResourceRequests(input.value);
    if (!result.ok) {
      return { ok: false, error: { message: result.error, kind: 'invalid-input' } };
    }

    const { totals } = result;
    const lines = [
      `Requests: cpu=${totals.requestsCpu} memory=${totals.requestsMemory}`,
      `Limits: cpu=${totals.limitsCpu} memory=${totals.limitsMemory}`,
      ...totals.containers.map(
        (container) =>
          `${container.name}: requests(cpu=${container.requestsCpu ?? '-'}, memory=${container.requestsMemory ?? '-'}) ` +
          `limits(cpu=${container.limitsCpu ?? '-'}, memory=${container.limitsMemory ?? '-'})`,
      ),
    ];

    return { ok: true, output: { type: 'text', value: lines.join('\n') } };
  },
};
