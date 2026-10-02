import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { findDuplicateLines } from "./duplicate-finder-logic.js";

/**
 * Pipeline-step adapter for the Duplicate Finder tool. Always reports duplicate lines (not
 * duplicate words, and not the dedupe-removal direction) case-sensitively — the component's own
 * defaults — until per-step params ship (DUDE_PRD.md §21 Item 2, v1.1).
 *
 * Drift from the declared `io` in tool-definitions.ts: it lists `produces: ['json', 'text']`,
 * covering both the "find" (json) and "remove" (text) directions the tool's UI offers. Since this
 * adapter only implements the "find" direction for now, it honestly produces just `['json']`.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Duplicate Finder expects text input.', kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'json', value: findDuplicateLines(input.value, true) } };
  },
};
