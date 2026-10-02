import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { generatePhoneticCodes } from "./soundex-metaphone-generate.js";

const COLUMNS = ['Word', 'Soundex', 'Metaphone'] as const;

/** Pipeline-step adapter for the Soundex / Metaphone tool. */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['table'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Soundex / Metaphone expects text input.', kind: 'invalid-input' } };
    }

    const entries = generatePhoneticCodes(input.value);
    return {
      ok: true,
      output: { type: 'table', value: { columns: COLUMNS, rows: entries.map((entry) => [entry.word, entry.soundex, entry.metaphone]) } },
    };
  },
};
