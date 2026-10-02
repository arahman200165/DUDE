import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { tokenize } from "./text-tokenizer-ngram-logic.js";

/**
 * Pipeline-step adapter for the Text Tokenizer & N-Gram Generator tool. Always tokenizes into
 * word-like tokens (the component's own default mode/granularity), rather than sentence
 * tokenization or n-gram generation, until per-step params ship (DUDE_PRD.md §21 Item 2, v1.1).
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Text Tokenizer / N-Grams expects text input.', kind: 'invalid-input' } };
    }

    const tokens = tokenize(input.value, 'word')
      .filter((token) => token.isWordLike)
      .map((token) => token.text);
    return { ok: true, output: { type: 'json', value: tokens } };
  },
};
