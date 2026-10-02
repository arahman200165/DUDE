import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { parseCookieHeader } from "./cookie-header.js";

/**
 * Pipeline-step adapter for the Cookie Tools tool. Always parses a request `Cookie:` header
 * into `{key, value}[]` json — matches the tool's own default mode (`cookie`, not `set-cookie`).
 * Until per-step params ship (DUDE_PRD.md §21 Item 2, v1.1), a pipeline step cannot select the
 * unrelated Set-Cookie build/parse mode instead.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Cookie Tools expects text input.', kind: 'invalid-input' } };
    }

    const pairs = parseCookieHeader(input.value);
    return { ok: true, output: { type: 'json', value: pairs } };
  },
};
