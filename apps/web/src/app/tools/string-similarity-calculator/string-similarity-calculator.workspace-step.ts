import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'string-similarity-calculator';

/** Multi-input tool — captures both strings, unlike Pipelines' unary-input constraint. */
export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const left = readStorageValue<string>(TOOL_ID, 'left', 'session');
    const right = readStorageValue<string>(TOOL_ID, 'right', 'session');
    if (!left && !right) return undefined;

    return { state: { left: left ?? '', right: right ?? '' }, summary: `Similarity: "${left ?? ''}" vs "${right ?? ''}"` };
  },

  restore(state): void {
    if (typeof state['left'] === 'string') writeStorageValue(TOOL_ID, 'left', 'session', state['left']);
    if (typeof state['right'] === 'string') writeStorageValue(TOOL_ID, 'right', 'session', state['right']);
  },
};
