import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { convertIni } from "./ini-convert.js";

/**
 * Pipeline-step adapter for the INI Formatter / Parser tool. Always converts INI -> JSON — the
 * tool's own default direction — so `accepts` is narrowed to `text` (raw INI) rather than the
 * declared registry `io`'s `['text', 'json']`, which also covers the unused reverse
 * `json-to-ini` direction; `produces` is narrowed to `json` for the same reason.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'INI Formatter / Parser expects text input.', kind: 'invalid-input' } };
    }

    const result = convertIni(input.value, 'ini-to-json');
    if (!result.ok) {
      return { ok: false, error: { message: result.error.message, kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'json', value: JSON.parse(result.output) } };
  },
};
