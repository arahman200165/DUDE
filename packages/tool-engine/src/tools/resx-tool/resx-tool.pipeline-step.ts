import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { parseResx } from "./resx-transform.js";

/**
 * Pipeline-step adapter for the Resx Tool. Only its View mode (`parseResx`) takes a single input
 * value — Diff and Merge each need two independent `.resx` documents (base + overlay), which
 * isn't representable by a single flowing pipeline value. Until per-step params ship
 * (DUDE_PRD.md §21 Item 2, v1.1), a pipeline step cannot select Diff/Merge/Extract Tokens.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['table'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Resx Tool expects text input.', kind: 'invalid-input' } };
    }

    const result = parseResx(input.value);
    if (!result.ok) {
      return { ok: false, error: { message: result.error.message, kind: 'invalid-input' } };
    }

    return {
      ok: true,
      output: {
        type: 'table',
        value: {
          columns: ['name', 'value', 'comment'],
          rows: result.entries.map((entry) => [entry.name, entry.value, entry.comment ?? '']),
        },
      },
    };
  },
};
