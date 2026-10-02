import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { generateCreateTable } from "./create-table-generator-logic.js";

/**
 * Pipeline-step adapter for the CREATE TABLE Generator tool. Accepts either a `text` sample
 * (JSON array or CSV) or an already-parsed `json` value, and always generates against the
 * PostgreSQL dialect with the tool's own default table name — until per-step params ship
 * (DUDE_PRD.md §21 Item 2, v1.1), a pipeline step cannot select a different dialect/table name.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text', 'json'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    const sample = input.type === 'json' ? JSON.stringify(input.value) : input.type === 'text' ? input.value : null;
    if (sample === null) {
      return { ok: false, error: { message: 'CREATE TABLE Generator expects text or JSON input.', kind: 'invalid-input' } };
    }

    const result = generateCreateTable(sample, 'users', 'postgresql');
    return result.ok
      ? { ok: true, output: { type: 'text', value: result.sql } }
      : { ok: false, error: { message: result.error, kind: 'invalid-input' } };
  },
};
