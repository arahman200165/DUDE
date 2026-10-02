import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'number-base';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const value = readStorageValue<string>(TOOL_ID, 'value', 'local');
    if (!value) return undefined;
    return { state: { value }, summary: `Number base: ${value}` };
  },

  restore(state): void {
    if (typeof state['value'] === 'string') writeStorageValue(TOOL_ID, 'value', 'local', state['value']);
  },
};
