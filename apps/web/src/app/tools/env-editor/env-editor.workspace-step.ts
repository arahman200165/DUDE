import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'env-editor';

/** `historyEligible` is deliberately omitted — .env content routinely embeds real secrets (API keys, DB URLs). */
export const workspaceStep: WorkspaceStep = {
  snapshot(): WorkspaceSnapshot | undefined {
    const raw = readStorageValue<string>(TOOL_ID, 'raw', 'session');
    if (!raw) return undefined;
    return { state: { raw }, summary: '.env editor' };
  },

  restore(state): void {
    if (typeof state['raw'] === 'string') writeStorageValue(TOOL_ID, 'raw', 'session', state['raw']);
  },
};
