import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'regex-visualizer';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const pattern = readStorageValue<string>(TOOL_ID, 'pattern', 'session');
    if (!pattern) return undefined;

    const flags = readStorageValue<string>(TOOL_ID, 'flags', 'session') ?? '';
    return { state: { pattern, flags }, summary: `Regex diagram: /${pattern}/${flags}` };
  },

  restore(state): void {
    if (typeof state['pattern'] === 'string') writeStorageValue(TOOL_ID, 'pattern', 'session', state['pattern']);
    if (typeof state['flags'] === 'string') writeStorageValue(TOOL_ID, 'flags', 'session', state['flags']);
  },
};
