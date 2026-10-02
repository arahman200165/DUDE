import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { parseGitUrl } from "./git-url-parser-logic.js";

/** Pipeline-step adapter for the Git URL Parser tool. Accepts either plain text or a `url` value, since both carry the same string. */
export const pipelineStep: PipelineStep = {
  accepts: ['text', 'url'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text' && input.type !== 'url') {
      return { ok: false, error: { message: 'Git URL Parser expects text or url input.', kind: 'invalid-input' } };
    }

    try {
      const result = parseGitUrl(input.value);
      if (!result.ok) {
        return { ok: false, error: { message: result.error, kind: 'invalid-input' } };
      }

      return { ok: true, output: { type: 'json', value: result.value } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Failed to parse git URL.', kind: 'execution-error' } };
    }
  },
};
