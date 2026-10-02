import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { testCronJobSchedule } from "./k8s-cronjob-tester-logic.js";

/**
 * Pipeline-step adapter for the Kubernetes CronJob Schedule Tester tool. Renders the extracted
 * schedule's plain-English description and next run times as `text` — matching the tool's
 * declared `produces: ['text']` — using the tool's own defaults (5 upcoming runs, local
 * timezone) since a pipeline step has no count/timezone controls yet.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'K8s CronJob Tester expects text input.', kind: 'invalid-input' } };
    }

    const tested = testCronJobSchedule(input.value, 5, 'local');
    if (!tested.ok) {
      return { ok: false, error: { message: tested.error, kind: 'invalid-input' } };
    }

    const { info, result } = tested;
    if (!result.ok) {
      return { ok: false, error: { message: result.error, kind: 'invalid-input' } };
    }

    const lines = [
      `Schedule: ${info.schedule}${info.suspend ? ' (suspended)' : ''}`,
      result.description,
      'Next runs:',
      ...result.nextRuns.map((run) => `  ${run.display}`),
    ];

    return { ok: true, output: { type: 'text', value: lines.join('\n') } };
  },
};
