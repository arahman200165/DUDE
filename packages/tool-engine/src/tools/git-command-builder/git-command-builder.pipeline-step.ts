import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { buildGitCommand } from "./git-command-builder-logic.js";

/**
 * Pipeline-step adapter for the Git Command Builder tool. Always builds a
 * `commit` command, treating the flowing text as the commit message (`-m`) —
 * until per-step params ship (DUDE_PRD.md §21 Item 2, v1.1), a pipeline step
 * cannot select a different subcommand/field set.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Git Command Builder expects text input.', kind: 'invalid-input' } };
    }

    try {
      const message = input.value.trim();
      return { ok: true, output: { type: 'text', value: buildGitCommand('commit', { message }) } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Failed to build command.', kind: 'execution-error' } };
    }
  },
};
