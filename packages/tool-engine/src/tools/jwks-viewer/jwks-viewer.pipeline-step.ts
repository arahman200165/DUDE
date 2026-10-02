import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { parseJwks } from "./jwks-viewer-logic.js";

/**
 * Pipeline-step adapter for the JWKS Viewer tool. Normalizes both `text` and `json` input into
 * a JSON string for `parseJwks` (which itself only accepts text), mirroring `json.pipeline-step.ts`'s
 * normalization pattern.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text', 'json'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    const text = input.type === 'json' ? JSON.stringify(input.value) : input.type === 'text' ? input.value : null;
    if (text === null) {
      return { ok: false, error: { message: 'JWKS Viewer expects text or JSON input.', kind: 'invalid-input' } };
    }

    try {
      const result = await parseJwks(text);
      return result.ok
        ? { ok: true, output: { type: 'json', value: { keys: result.keys } } }
        : { ok: false, error: { message: result.error, kind: 'invalid-input' } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Failed to parse JWKS document.', kind: 'execution-error' } };
    }
  },
};
