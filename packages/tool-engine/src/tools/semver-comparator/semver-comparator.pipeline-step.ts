import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { sortVersions } from "./semver-compare.js";

/**
 * Pipeline-step adapter for the Semantic Version Comparator tool. Only `sortVersions` takes a
 * single input value (a newline-separated version list) — `compareVersions`/`checkRange` each
 * need two independent version/range strings, so this adapter always sorts (ascending) rather
 * than comparing or range-checking. Until per-step params ship (DUDE_PRD.md §21 Item 2, v1.1),
 * a pipeline step cannot select the Compare/Range Check/Visualize tabs, which are inherently
 * two-input.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Semantic Version Comparator expects text input.', kind: 'invalid-input' } };
    }

    const result = sortVersions(input.value.split('\n'), 'asc');
    return { ok: true, output: { type: 'json', value: result } };
  },
};
