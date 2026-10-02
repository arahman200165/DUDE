import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { RotMode } from "@dude/tool-engine/tools/rot-cipher/rot-cipher";

const TOOL_ID = 'rot-cipher';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    if (!input) return undefined;

    const mode = readStorageValue<RotMode>(TOOL_ID, 'mode', 'local') ?? 'rot13';
    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return { state: { input, mode }, summary: `${mode.toUpperCase()}: "${preview}"` };
  },

  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (state['mode'] === 'rot13' || state['mode'] === 'rot47') writeStorageValue(TOOL_ID, 'mode', 'local', state['mode']);
  },
};
