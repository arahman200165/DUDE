import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { runUnicodeTableRequest } from "./unicode-table-browse.js";

const COLUMNS = ['Code Point', 'Char', 'Category', 'Block', 'Name'] as const;

/**
 * Pipeline-step adapter for the Unicode Table tool. Runs a search across every block (rather
 * than the component's default block-scoped browse), since a pipeline step has no block
 * selection UI. Despite the tool's `execution.worker: 'required'` policy for the interactive UI,
 * this adapter calls the underlying pure function directly and synchronously, as instructed.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['table'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Unicode Table expects text input.', kind: 'invalid-input' } };
    }

    try {
      const result = runUnicodeTableRequest({ mode: 'search', query: input.value, scope: 'all' });
      return {
        ok: true,
        output: {
          type: 'table',
          value: {
            columns: COLUMNS,
            rows: result.rows.map((row) => [row.codePointHex, row.char, `${row.categoryAbbreviation} — ${row.categoryLabel}`, row.block, row.name]),
          },
        },
      };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : String(error), kind: 'execution-error' } };
    }
  },
};
