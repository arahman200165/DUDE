import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { generateModel } from "./model-generator-generate.js";

/**
 * Pipeline-step adapter for the Model Generator (JSON -> Code) tool. Always emits TypeScript with
 * a "Root" root type name — until per-step params ship (DUDE_PRD.md §21 Item 2, v1.1), a pipeline
 * step cannot select the target language or a custom root name, matching the convention set by
 * `base64.pipeline-step.ts`/`compression-lab.pipeline-step.ts` for other mode-driven tools.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['json'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'json') {
      return { ok: false, error: { message: 'Model Generator expects JSON input.', kind: 'invalid-input' } };
    }

    const result = generateModel(JSON.stringify(input.value), 'Root', 'typescript');
    if (!result.ok) {
      return { ok: false, error: { message: result.error, kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'text', value: result.code } };
  },
};
