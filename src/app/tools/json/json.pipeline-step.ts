import { PipelineStep, PipelineStepContext, PipelineStepResult, PipelineValue } from '../../shared/models/pipeline-step.model';
import { processJson } from './json-format';
import { JsonFormatPayload } from './json-format-payload';

/**
 * Pipeline-step adapter for the JSON Formatter tool. Until per-step params ship (DUDE_PRD.md §21
 * Item 2, v1.1), this always parses and normalizes to a `json` value rather than exposing the
 * tool's minify/validate modes. When the runner offers `context.offload` (Phase 26 Item 13), the
 * parse runs in the tool's own `json-format.worker.ts`, exactly as `json.ts`'s component does.
 * Otherwise it runs inline with the same `processJson`.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text', 'json'],
  produces: ['json'],
  async run(input: PipelineValue, context?: PipelineStepContext): Promise<PipelineStepResult> {
    const text = input.type === 'json' ? JSON.stringify(input.value) : input.type === 'text' ? input.value : null;
    if (text === null) {
      return { ok: false, error: { message: 'JSON Formatter expects text or JSON input.', kind: 'invalid-input' } };
    }

    const result = context?.offload
      ? await context.offload<JsonFormatPayload, ReturnType<typeof processJson>>(
          () => new Worker(new URL('./json-format.worker', import.meta.url), { type: 'module' }),
          { input: text, mode: 'pretty', indent: 2 },
        )
      : processJson(text, 'pretty', 2);
    if (!result.ok) {
      return { ok: false, error: { message: result.error.message, kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'json', value: JSON.parse(result.output) } };
  },
};
