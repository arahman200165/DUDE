import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { formatDate, parseTimestamp } from "./timestamp-convert.js";

/**
 * Pipeline-step adapter for the Unix Timestamp Converter tool. Always parses with
 * unit `'auto'` (digit-length heuristic, or ISO 8601/HTTP-date/RFC 2822 detection) and
 * always emits UTC ISO 8601 text — until per-step params ship (DUDE_PRD.md §21 Item 2,
 * v1.1), a pipeline step cannot select a different output unit/timezone.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Unix Timestamp Converter expects text input.', kind: 'invalid-input' } };
    }

    try {
      const result = parseTimestamp(input.value, 'auto');
      if (!result.ok) {
        return { ok: false, error: { message: result.error, kind: 'invalid-input' } };
      }

      return { ok: true, output: { type: 'text', value: formatDate(result.date, 'utc') } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Failed to convert timestamp.', kind: 'execution-error' } };
    }
  },
};
