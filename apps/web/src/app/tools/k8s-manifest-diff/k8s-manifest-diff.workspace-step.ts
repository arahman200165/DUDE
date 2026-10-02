import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'k8s-manifest-diff';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const before = readStorageValue<string>(TOOL_ID, 'before', 'session');
    const after = readStorageValue<string>(TOOL_ID, 'after', 'session');
    if (!before && !after) return undefined;
    return { state: { before: before ?? '', after: after ?? '' }, summary: 'K8s manifest diff' };
  },

  restore(state): void {
    if (typeof state['before'] === 'string') writeStorageValue(TOOL_ID, 'before', 'session', state['before']);
    if (typeof state['after'] === 'string') writeStorageValue(TOOL_ID, 'after', 'session', state['after']);
  },
};
