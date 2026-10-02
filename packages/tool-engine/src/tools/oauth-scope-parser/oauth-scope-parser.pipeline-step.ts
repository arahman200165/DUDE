import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { annotateKnownScopes, parseScopeString } from "./oauth-scope-parser-logic.js";

/**
 * Pipeline-step adapter for the OAuth Scope Parser tool — splits a space-delimited scope
 * string, dedupes it, and annotates well-known scopes.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'OAuth Scope Parser expects text input.', kind: 'invalid-input' } };
    }

    const parsed = parseScopeString(input.value);
    const annotated = annotateKnownScopes(parsed.scopes);

    return {
      ok: true,
      output: {
        type: 'json',
        value: { scopes: annotated, duplicates: parsed.duplicates, normalized: parsed.normalized },
      },
    };
  },
};
