import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { computeKeywordFrequency } from "./keyword-frequency.js";

const COLUMNS = ['Word', 'Count'] as const;

/**
 * Pipeline-step adapter for the Keyword Frequency Analyzer tool. Always uses the component's own
 * default options (stop words ignored, min length 3, case-insensitive) until per-step params ship
 * (DUDE_PRD.md §21 Item 2, v1.1).
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['table'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Keyword Frequency Analyzer expects text input.', kind: 'invalid-input' } };
    }

    const entries = computeKeywordFrequency(input.value, { ignoreStopWords: true, minLength: 3, caseSensitive: false });
    return {
      ok: true,
      output: { type: 'table', value: { columns: COLUMNS, rows: entries.map((entry) => [entry.word, entry.count]) } },
    };
  },
};
