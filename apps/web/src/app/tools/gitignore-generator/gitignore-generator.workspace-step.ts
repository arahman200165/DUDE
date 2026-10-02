import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'gitignore-generator';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const selected = readStorageValue<readonly string[]>(TOOL_ID, 'selected', 'local');
    if (!selected || selected.length === 0) return undefined;
    return { state: { selected }, summary: `.gitignore: ${selected.join(', ')}` };
  },

  restore(state): void {
    if (Array.isArray(state['selected'])) writeStorageValue(TOOL_ID, 'selected', 'local', state['selected']);
  },
};
