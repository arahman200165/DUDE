import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { exploreDstTransitions } from "./dst-transition-explorer-logic.js";

const COLUMNS = ['Date', 'Local time before', 'Local time after', 'Direction', 'From offset', 'To offset', 'Gap (min)'] as const;

/**
 * Pipeline-step adapter for the DST Transition Explorer. The piped text is
 * the IANA timezone name (e.g. "America/New_York"); the year defaults to the
 * current year, matching the tool's own default, until per-step params ship
 * (DUDE_PRD.md §21 Item 2, v1.1).
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['table'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'DST Transition Explorer expects a timezone name as text input.', kind: 'invalid-input' } };
    }

    const result = exploreDstTransitions(input.value, new Date().getFullYear());
    if (!result.ok) {
      return { ok: false, error: { message: result.error, kind: 'invalid-input' } };
    }

    return {
      ok: true,
      output: {
        type: 'table',
        value: {
          columns: COLUMNS,
          rows: result.rows.map((row) => [
            row.date,
            row.localTimeBefore,
            row.localTimeAfter,
            row.direction,
            row.fromOffset,
            row.toOffset,
            row.gapMinutes,
          ]),
        },
      },
    };
  },
};
