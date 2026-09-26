import { PipelineStep, PipelineStepResult, PipelineValue } from '../../shared/models/pipeline-step.model';
import { resolveJsonPointer } from './json-pointer-transform';

/**
 * Pipeline-step adapter for the JSON Pointer Tester tool. The pointer is a config value
 * alongside the flowing document. Until per-step parameters are available, this adapter
 * retains its established /0 default; the resolver also supports RFC 6901 root pointers.
 */
const DEFAULT_POINTER = '/0';

export const pipelineStep: PipelineStep = {
  accepts: ['text', 'json'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    const text = input.type === 'json' ? JSON.stringify(input.value) : input.type === 'text' ? input.value : null;
    if (text === null) {
      return { ok: false, error: { message: 'JSON Pointer Tester expects text or JSON input.', kind: 'invalid-input' } };
    }

    const result = resolveJsonPointer(text, DEFAULT_POINTER);
    if (!result.ok) {
      return { ok: false, error: { message: result.error.message, kind: 'invalid-input' } };
    }

    let value: unknown;
    try {
      value = JSON.parse(result.output);
    } catch {
      value = null;
    }
    return { ok: true, output: { type: 'json', value } };
  },
};
