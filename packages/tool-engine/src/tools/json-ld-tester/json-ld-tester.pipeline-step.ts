import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { validateJsonLd } from "./json-ld-logic.js";

/**
 * Pipeline-step adapter for the Structured Data / JSON-LD Tester tool — validates a JSON-LD
 * block's shape against common Schema.org types.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text', 'json'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    const text = input.type === 'json' ? JSON.stringify(input.value) : input.type === 'text' ? input.value : null;
    if (text === null) {
      return { ok: false, error: { message: 'Structured Data / JSON-LD Tester expects text or JSON input.', kind: 'invalid-input' } };
    }

    const result = validateJsonLd(text);
    return result.ok
      ? { ok: true, output: { type: 'json', value: { findings: result.findings } } }
      : { ok: false, error: { message: result.parseError, kind: 'invalid-input' } };
  },
};
