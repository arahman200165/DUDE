import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { parseCronExpression } from "./cron-parse.js";

/**
 * Pipeline-step adapter for the Cron Expression Parser tool. Always uses the tool's own
 * defaults (5 occurrences, local timezone) — dates are serialized to ISO strings so the json
 * value stays plain/JSON-serializable per `PipelineValue`'s contract.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Cron Expression Parser expects text input.', kind: 'invalid-input' } };
    }

    const result = parseCronExpression(input.value, { count: 5, tz: 'local' });
    if (!result.ok) {
      return { ok: false, error: { message: result.error, kind: 'invalid-input' } };
    }

    return {
      ok: true,
      output: {
        type: 'json',
        value: {
          description: result.description,
          nextRuns: result.nextRuns.map((r) => ({ date: r.date.toISOString(), display: r.display })),
          previousRuns: result.previousRuns.map((r) => ({ date: r.date.toISOString(), display: r.display })),
        },
      },
    };
  },
};
