import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { lintYaml } from "./yaml-lint.js";

/**
 * Pipeline-step adapter for the YAML Linter tool. `lintYaml` returns a `{documentCount}` summary
 * rather than a document, so this step synthesizes a short `text` status message from it — the
 * flowing document itself is not transformed, matching how a linter's job is validation, not
 * conversion.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'YAML Linter expects text input.', kind: 'invalid-input' } };
    }

    const result = lintYaml(input.value);
    if (!result.ok) {
      const location = result.error.line != null ? ` (line ${result.error.line}, column ${result.error.column})` : '';
      return { ok: false, error: { message: `${result.error.message}${location}`, kind: 'invalid-input' } };
    }

    const noun = result.documentCount === 1 ? 'document' : 'documents';
    return { ok: true, output: { type: 'text', value: `Valid YAML — ${result.documentCount} ${noun}.` } };
  },
};
