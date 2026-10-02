import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { convertProperties } from "./properties-convert.js";

/**
 * Pipeline-step adapter for the Properties File Parser tool. Always converts
 * properties -> JSON — the tool's own default direction — so `accepts` is narrowed to `text`
 * (a raw `.properties` file) rather than the declared registry `io`'s `['text', 'json']`, which
 * also covers the unused reverse `json-to-properties` direction; `produces` is narrowed to `json`
 * for the same reason.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Properties File Parser expects text input.', kind: 'invalid-input' } };
    }

    const result = convertProperties(input.value, 'properties-to-json');
    if (!result.ok) {
      return { ok: false, error: { message: result.error.message, kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'json', value: JSON.parse(result.output) } };
  },
};
