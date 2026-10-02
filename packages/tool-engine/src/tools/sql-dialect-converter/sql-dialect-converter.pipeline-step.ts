import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { convertSqlDialect } from "./sql-dialect-converter-logic.js";

/**
 * Pipeline-step adapter for the SQL Dialect Converter tool. Always converts
 * PostgreSQL to MySQL — until per-step params ship (DUDE_PRD.md §21 Item 2,
 * v1.1), a pipeline step cannot select a different source/target pair.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'SQL Dialect Converter expects text input.', kind: 'invalid-input' } };
    }

    try {
      const result = convertSqlDialect(input.value, 'postgresql', 'mysql');
      return result.ok
        ? { ok: true, output: { type: 'text', value: result.output } }
        : { ok: false, error: { message: result.error, kind: 'invalid-input' } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Failed to convert SQL dialect.', kind: 'execution-error' } };
    }
  },
};
