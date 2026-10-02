import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'commit-message-validator';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const message = readStorageValue<string>(TOOL_ID, 'message', 'session');
    if (!message) return undefined;
    return { state: { message }, summary: `Commit message: "${message}"` };
  },

  restore(state): void {
    if (typeof state['message'] === 'string') writeStorageValue(TOOL_ID, 'message', 'session', state['message']);
  },
};
