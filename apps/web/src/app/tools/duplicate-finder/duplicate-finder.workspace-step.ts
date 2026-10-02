import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'duplicate-finder';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    if (!input) return undefined;

    const mode = readStorageValue<'lines' | 'words'>(TOOL_ID, 'mode', 'local') ?? 'lines';
    const caseSensitive = readStorageValue<boolean>(TOOL_ID, 'caseSensitive', 'local') ?? true;
    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return { state: { input, mode, caseSensitive }, summary: `Duplicate ${mode}: "${preview}"` };
  },

  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (state['mode'] === 'lines' || state['mode'] === 'words') writeStorageValue(TOOL_ID, 'mode', 'local', state['mode']);
    if (typeof state['caseSensitive'] === 'boolean') writeStorageValue(TOOL_ID, 'caseSensitive', 'local', state['caseSensitive']);
  },
};
