import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { buildRegexDiagram } from "./regex-diagram.js";

/**
 * Pipeline-step adapter for the Regex Visualizer tool. The flowing input is the
 * pattern itself; flags default to empty — until per-step params ship (DUDE_PRD.md
 * §21 Item 2, v1.1), a pipeline step has no separate slot for them. Emits the
 * railroad diagram serialized to its SVG markup text (`DiagramPart.toString()`),
 * rather than the raw `DiagramPart` object the component hands to `.addTo()`.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Regex Visualizer expects text input.', kind: 'invalid-input' } };
    }

    try {
      const result = buildRegexDiagram(input.value, '');
      if (!result.ok) {
        return { ok: false, error: { message: result.error, kind: 'invalid-input' } };
      }

      return { ok: true, output: { type: 'text', value: result.diagram.toString() } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Failed to build diagram.', kind: 'execution-error' } };
    }
  },
};
