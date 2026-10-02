import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { buildOffsetGrid } from "./timezone-offset-comparator-logic.js";

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/**
 * Pipeline-step adapter for the Timezone Offset Comparator — always the grid
 * mode (a year-long monthly-offset table), since it takes a single list of
 * zones rather than the pairwise mode's two separate zone + moment fields.
 * The piped text is a comma-separated zone list (e.g.
 * "America/New_York, Europe/London"); the year defaults to the current year
 * until per-step params ship (DUDE_PRD.md §21 Item 2, v1.1).
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['table'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return {
        ok: false,
        error: { message: 'Timezone Offset Comparator expects a comma-separated list of timezones as text input.', kind: 'invalid-input' },
      };
    }

    const zones = input.value
      .split(',')
      .map((zone) => zone.trim())
      .filter((zone) => zone !== '');

    const result = buildOffsetGrid({ zones, year: new Date().getFullYear() });
    if (!result.ok) {
      return { ok: false, error: { message: result.error, kind: 'invalid-input' } };
    }

    return {
      ok: true,
      output: {
        type: 'table',
        value: { columns: ['Zone', ...MONTHS], rows: result.rows.map((row) => [row.zone, ...row.monthlyOffsets]) },
      },
    };
  },
};
