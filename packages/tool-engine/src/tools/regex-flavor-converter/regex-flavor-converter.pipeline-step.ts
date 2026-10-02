import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { convertRegexFlavor } from "./regex-flavor-convert.js";

/**
 * Pipeline-step adapter for the Regex Flavor Converter tool. Always converts
 * JavaScript source syntax to Python `re` syntax — until per-step params ship
 * (DUDE_PRD.md §21 Item 2, v1.1), a pipeline step cannot select a different
 * source/target pair. Drops the tool's `warnings` list (e.g. unsupported Go
 * constructs) since the contract has no side-channel for it; only the emitted
 * pattern text is passed downstream.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Regex Flavor Converter expects text input.', kind: 'invalid-input' } };
    }

    try {
      const result = convertRegexFlavor(input.value, '', 'js', 'python');
      if (!result.ok) {
        return { ok: false, error: { message: result.error, kind: 'invalid-input' } };
      }

      return { ok: true, output: { type: 'text', value: result.output } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Failed to convert pattern.', kind: 'execution-error' } };
    }
  },
};
