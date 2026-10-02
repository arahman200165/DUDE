import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { DEFAULT_ANIMATION_SETTINGS, DEFAULT_STOPS, buildFullCss } from "./css-animation-logic.js";

/**
 * Pipeline-step adapter for the CSS Animation Builder. The piped text is used as the
 * `@keyframes`/`animation` name — the tool's other settings and its default percentage stops
 * stay at their defaults; an empty input falls back to the tool's own default name ("pulse").
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'CSS Animation Builder expects text input.', kind: 'invalid-input' } };
    }

    const name = input.value.trim() === '' ? DEFAULT_ANIMATION_SETTINGS.name : input.value.trim();
    const css = buildFullCss({ ...DEFAULT_ANIMATION_SETTINGS, name }, DEFAULT_STOPS);

    return { ok: true, output: { type: 'text', value: css } };
  },
};
