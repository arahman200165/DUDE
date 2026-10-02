import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { ASCII_TABLE } from "./ascii-table-data.js";
import { filterAsciiTable } from "./ascii-table-search.js";

const COLUMNS = ['Dec', 'Hex', 'Oct', 'Char', 'Name', 'Category'] as const;

/** Pipeline-step adapter for the ASCII Table reference tool — filters by the input text. */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['table'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'ASCII Table expects text input.', kind: 'invalid-input' } };
    }

    const entries = filterAsciiTable(ASCII_TABLE, input.value);
    return {
      ok: true,
      output: {
        type: 'table',
        value: {
          columns: COLUMNS,
          rows: entries.map((entry) => [entry.decimal, entry.hex, entry.octal, entry.char, entry.name, entry.category]),
        },
      },
    };
  },
};
