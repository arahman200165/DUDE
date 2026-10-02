import { PipelineStep, PipelineStepResult } from "@dude/contracts/shared/models/pipeline-step.model";
import { generateRows } from "./random-data-fields.js";

const DEFAULT_FIELD_KEYS: readonly string[] = ['fullName', 'email', 'phoneNumber', 'streetAddress', 'city'];
const DEFAULT_ROW_COUNT = 10;

/**
 * Pipeline-step adapter for the Random Data Generator — a generator-style
 * step with no meaningful input (DUDE_PRD.md §21 Item 2's pipeline batch
 * migration guidance): the piped value is ignored and a table of fake rows
 * is generated using the same default field selection as the tool's own
 * initial view, typically used to seed a chain.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['json'],
  produces: ['table'],
  async run(): Promise<PipelineStepResult> {
    const result = generateRows({ fieldKeys: DEFAULT_FIELD_KEYS, rowCount: DEFAULT_ROW_COUNT });
    if (!result.ok) {
      return { ok: false, error: { message: result.error, kind: 'execution-error' } };
    }

    return { ok: true, output: { type: 'table', value: { columns: result.columns, rows: result.rows } } };
  },
};
