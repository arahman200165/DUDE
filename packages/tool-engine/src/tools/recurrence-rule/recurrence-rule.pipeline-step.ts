import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { computeOccurrences } from "./recurrence-calc.js";

const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Pipeline-step adapter for the Recurrence Rule Calculator. Only the RRULE
 * text itself flows through the pipeline; the start date/time, timezone, and
 * occurrence cap are fixed sensible defaults (today at 09:00 in the browser's
 * own zone, capped at 10 occurrences) until per-step params ship (DUDE_PRD.md
 * §21 Item 2, v1.1).
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Recurrence Rule Calculator expects text input.', kind: 'invalid-input' } };
    }

    const result = computeOccurrences({
      startDate: today(),
      startTime: '09:00',
      ruleText: input.value,
      timezone: browserZone,
      maxOccurrences: 10,
    });

    if (!result.ok) {
      return { ok: false, error: { message: result.error, kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'json', value: { occurrences: result.occurrences, humanText: result.humanText } } };
  },
};
