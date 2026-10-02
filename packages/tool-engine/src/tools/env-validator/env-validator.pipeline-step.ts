import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { validateEnv } from "./env-validator-logic.js";

/**
 * Pipeline-step adapter for the .env Validator tool. The `.env` document flows through as
 * `input`; the required-keys rule list is a small, config-like second parameter (not a second
 * document), so this adapter validates against the tool's own default rule set — until
 * per-step params ship (DUDE_PRD.md §21 Item 2, v1.1), a pipeline step cannot supply a custom
 * rule list.
 */
const DEFAULT_RULES = 'PORT:number\nDEBUG:boolean?\nNAME\nAPI_URL:url?';

export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: '.env Validator expects text input.', kind: 'invalid-input' } };
    }

    const issues = validateEnv(input.value, DEFAULT_RULES);
    const value = issues.length === 0 ? 'No issues found.' : issues.map((issue) => `${issue.key}: ${issue.message}`).join('\n');

    return { ok: true, output: { type: 'text', value } };
  },
};
