import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { checkSqlSyntax } from "./sql-syntax-checker-logic.js";

/**
 * Pipeline-step adapter for the SQL Syntax Checker tool. Always checks against
 * the PostgreSQL dialect — until per-step params ship (DUDE_PRD.md §21 Item 2,
 * v1.1), a pipeline step cannot select a different one. The step itself never
 * fails for bad SQL: an invalid statement is a reported finding (text describing
 * the syntax error), not a broken pipeline step — only a non-text input is.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'SQL Syntax Checker expects text input.', kind: 'invalid-input' } };
    }

    try {
      const result = checkSqlSyntax(input.value, 'postgresql');
      const value = result.ok
        ? 'Valid SQL.'
        : `Syntax error: ${result.message}${result.location ? ` (line ${result.location.line}, column ${result.location.column})` : ''}`;
      return { ok: true, output: { type: 'text', value } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Failed to check SQL syntax.', kind: 'execution-error' } };
    }
  },
};
