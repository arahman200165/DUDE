import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { TomlMode } from "@dude/tool-engine/tools/toml-formatter/toml-format";

const TOOL_ID = 'toml-formatter';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    if (!input) return undefined;

    const mode = readStorageValue<TomlMode>(TOOL_ID, 'mode', 'local') ?? 'format';
    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return { state: { input, mode }, summary: `TOML (${mode}): "${preview}"` };
  },

  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (typeof state['mode'] === 'string') writeStorageValue(TOOL_ID, 'mode', 'local', state['mode']);
  },
};
