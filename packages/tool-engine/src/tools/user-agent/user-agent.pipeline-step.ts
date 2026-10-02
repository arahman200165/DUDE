import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { parseUserAgent } from "./ua-parse.js";

/** Pipeline-step adapter for the User-Agent Parser tool. */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'User-Agent Parser expects text input.', kind: 'invalid-input' } };
    }

    const result = parseUserAgent(input.value);
    if (!result.ok) {
      return { ok: false, error: { message: result.error, kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'json', value: result.parsed } };
  },
};
