import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { EscapeMode } from "@dude/tool-engine/tools/escape-unescape-toolkit/escape-unescape";

const TOOL_ID = 'escape-unescape-toolkit';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    if (!input) return undefined;

    const direction = readStorageValue<'escape' | 'unescape'>(TOOL_ID, 'direction', 'local') ?? 'escape';
    const mode = readStorageValue<EscapeMode>(TOOL_ID, 'mode', 'local') ?? 'javascript';
    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return { state: { input, direction, mode }, summary: `${mode} ${direction}: "${preview}"` };
  },

  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (state['direction'] === 'escape' || state['direction'] === 'unescape') writeStorageValue(TOOL_ID, 'direction', 'local', state['direction']);
    if (typeof state['mode'] === 'string') writeStorageValue(TOOL_ID, 'mode', 'local', state['mode']);
  },
};
