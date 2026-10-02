import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { findYamlAnchors } from "./yaml-anchors-transform.js";

/**
 * Pipeline-step adapter for the YAML Anchor / Alias Visualizer tool. Normalizes the tool's
 * `{anchor, definitionPaths, aliasPaths}[]` result into the `table` shape the registry's declared
 * `io` promises, joining each anchor's paths into a single display string per column.
 */
const COLUMNS = ['Anchor', 'Definitions', 'Aliases'] as const;

export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['table'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'YAML Anchor / Alias Visualizer expects text input.', kind: 'invalid-input' } };
    }

    const result = findYamlAnchors(input.value);
    if (!result.ok) {
      return { ok: false, error: { message: result.error.message, kind: 'invalid-input' } };
    }

    const rows = result.anchors.map((anchor) => [anchor.anchor, anchor.definitionPaths.join(', '), anchor.aliasPaths.join(', ')]);
    return { ok: true, output: { type: 'table', value: { columns: COLUMNS, rows } } };
  },
};
