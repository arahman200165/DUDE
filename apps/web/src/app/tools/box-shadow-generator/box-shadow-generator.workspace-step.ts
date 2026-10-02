import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'box-shadow-generator';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const layers = readStorageValue<readonly unknown[]>(TOOL_ID, 'layers', 'session');
    if (!layers || layers.length === 0) return undefined;
    return { state: { layers }, summary: `Box shadow: ${layers.length} layer${layers.length === 1 ? '' : 's'}` };
  },

  restore(state): void {
    if (Array.isArray(state['layers'])) writeStorageValue(TOOL_ID, 'layers', 'session', state['layers']);
  },
};
