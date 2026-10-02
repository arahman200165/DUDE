import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { parseGitRemotes } from "./git-remote-inspector-logic.js";

const COLUMNS = ['name', 'direction', 'url', 'host', 'owner', 'repo'] as const;

/** Pipeline-step adapter for the Git Remote Inspector tool — parses `git remote -v` output into a table. */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['table'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Git Remote Inspector expects text input.', kind: 'invalid-input' } };
    }

    try {
      const entries = parseGitRemotes(input.value);
      const rows = entries.map((entry) => [
        entry.name,
        entry.direction,
        entry.url,
        entry.parsed?.host ?? '',
        entry.parsed?.owner ?? '',
        entry.parsed?.repo ?? '',
      ]);

      return { ok: true, output: { type: 'table', value: { columns: COLUMNS, rows } } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Failed to parse remotes.', kind: 'execution-error' } };
    }
  },
};
