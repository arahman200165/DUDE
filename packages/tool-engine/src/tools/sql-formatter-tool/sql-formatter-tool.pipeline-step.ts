import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { formatSql } from "./sql-formatter-logic.js";

/**
 * Pipeline-step adapter for the SQL Formatter / Minifier tool. Always formats
 * (never minifies) under the standard SQL dialect — until per-step params ship
 * (DUDE_PRD.md §21 Item 2, v1.1), a pipeline step cannot select a different
 * dialect/mode.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'SQL Formatter / Minifier expects text input.', kind: 'invalid-input' } };
    }

    try {
      const result = formatSql(input.value, 'sql', 'format');
      return result.ok
        ? { ok: true, output: { type: 'text', value: result.output } }
        : { ok: false, error: { message: result.error, kind: 'invalid-input' } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Failed to format SQL.', kind: 'execution-error' } };
    }
  },
};
