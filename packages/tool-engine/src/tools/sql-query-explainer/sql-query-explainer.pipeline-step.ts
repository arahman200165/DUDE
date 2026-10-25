import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { explainSqlQuery } from "./sql-query-explainer-logic.js";
import { loadSqlParser } from "../../shared/sql/sql-parser.js";

/**
 * Pipeline-step adapter for the SQL Query Explainer tool. Always explains against the
 * PostgreSQL dialect (the tool's own default) — until per-step params ship (DUDE_PRD.md §21
 * Item 2, v1.1), a pipeline step cannot select a different dialect.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'SQL Query Explainer expects text input.', kind: 'invalid-input' } };
    }

    let parser;
    try {
      parser = await loadSqlParser('postgresql');
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Failed to load the SQL parser.', kind: 'execution-error' } };
    }
    const result = explainSqlQuery(parser, input.value, 'postgresql');
    return result.ok
      ? { ok: true, output: { type: 'text', value: result.lines.join('\n') } }
      : { ok: false, error: { message: result.error, kind: 'invalid-input' } };
  },
};
