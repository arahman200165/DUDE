import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'html-preview';

/** Sandboxed execution tool — source only, mirrors python-playground.workspace-step.ts's precedent. */
export const workspaceStep: WorkspaceStep = {
  snapshot(): WorkspaceSnapshot | undefined {
    const source = readStorageValue<string>(TOOL_ID, 'source', 'session');
    if (!source) return undefined;
    return { state: { source }, summary: 'HTML preview source' };
  },

  restore(state): void {
    if (typeof state['source'] === 'string') writeStorageValue(TOOL_ID, 'source', 'session', state['source']);
  },
};
