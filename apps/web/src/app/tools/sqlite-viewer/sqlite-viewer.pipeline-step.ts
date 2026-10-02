import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { inspectSqlite } from './sqlite-inspect';

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64.trim());
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/**
 * Pipeline-step adapter for the SQLite File Viewer tool. Accepts either a `file` value (the
 * uploaded `.sqlite` file) or a bare `bytes` value (both Base64 text per `pipeline-step.model.ts`).
 * `pipeline-step.model.ts`'s `table` value holds exactly one table, but `inspectSqlite` can return
 * several — this adapter surfaces the *first* table (alphabetically, per `inspectSqlite`'s own
 * ordering) and reports an error if the database has none. Multi-table output isn't representable
 * by a single `table` pipeline value until the contract grows a multi-table shape.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['file', 'bytes'],
  produces: ['table'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'file' && input.type !== 'bytes') {
      return { ok: false, error: { message: 'SQLite File Viewer expects file or bytes input.', kind: 'invalid-input' } };
    }

    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(input.type === 'file' ? input.value.base64 : input.value);
    } catch {
      return { ok: false, error: { message: 'Input is not valid Base64.', kind: 'invalid-input' } };
    }

    try {
      const result = await inspectSqlite(bytes);
      if (!result.ok) {
        return { ok: false, error: { message: result.error.message, kind: 'invalid-input' } };
      }
      const [table] = result.tables;
      if (!table) {
        return { ok: false, error: { message: 'This SQLite file has no tables.', kind: 'invalid-input' } };
      }
      return { ok: true, output: { type: 'table', value: { columns: table.columns, rows: table.rows } } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Failed to read SQLite file.', kind: 'execution-error' } };
    }
  },
};
