import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'json-patch-generate';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,
  snapshot(): WorkspaceSnapshot | undefined {
    const beforeInput = readStorageValue<string>(TOOL_ID, 'beforeInput', 'session');
    const afterInput = readStorageValue<string>(TOOL_ID, 'afterInput', 'session');
    if (!beforeInput && !afterInput) return undefined;
    return { state: { beforeInput: beforeInput ?? '', afterInput: afterInput ?? '' }, summary: 'JSON Patch generation' };
  },
  restore(state): void {
    if (typeof state['beforeInput'] === 'string') writeStorageValue(TOOL_ID, 'beforeInput', 'session', state['beforeInput']);
    if (typeof state['afterInput'] === 'string') writeStorageValue(TOOL_ID, 'afterInput', 'session', state['afterInput']);
  },
};
