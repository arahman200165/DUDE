import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import type { GitFieldValues, GitSubcommand } from "@dude/tool-engine/tools/git-command-builder/git-command-builder-logic";

const TOOL_ID = 'git-command-builder';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const values = readStorageValue<GitFieldValues>(TOOL_ID, 'values', 'session');
    if (!values || Object.keys(values).length === 0) return undefined;

    const subcommand = readStorageValue<GitSubcommand>(TOOL_ID, 'subcommand', 'local') ?? 'commit';
    return { state: { subcommand, values }, summary: `git ${subcommand} builder` };
  },

  restore(state): void {
    if (typeof state['subcommand'] === 'string') writeStorageValue(TOOL_ID, 'subcommand', 'local', state['subcommand']);
    if (typeof state['values'] === 'object' && state['values'] !== null) writeStorageValue(TOOL_ID, 'values', 'session', state['values']);
  },
};
