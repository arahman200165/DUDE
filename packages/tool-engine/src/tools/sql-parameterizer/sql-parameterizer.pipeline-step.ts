import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { parameterizeSql } from "./sql-parameterizer-logic.js";

/**
 * Pipeline-step adapter for the SQL Parameterizer tool. Always parameterizes
 * with `?` placeholders under the PostgreSQL dialect — until per-step params
 * ship (DUDE_PRD.md §21 Item 2, v1.1), a pipeline step cannot select a
 * different dialect/style. Emits `{ sql, values }` together as `json`;
 * declared `produces` is narrowed from the tool's `text`/`json` pair since the
 * extracted values would otherwise be silently dropped.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'SQL Parameterizer expects text input.', kind: 'invalid-input' } };
    }

    try {
      const result = parameterizeSql(input.value, 'postgresql', 'question');
      return result.ok
        ? { ok: true, output: { type: 'json', value: { sql: result.sql, values: result.values } } }
        : { ok: false, error: { message: result.error, kind: 'invalid-input' } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Failed to parameterize SQL.', kind: 'execution-error' } };
    }
  },
};
