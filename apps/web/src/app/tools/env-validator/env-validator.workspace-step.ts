import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'env-validator';

/** `historyEligible` is deliberately omitted — envText routinely embeds real secrets. */
export const workspaceStep: WorkspaceStep = {
  snapshot(): WorkspaceSnapshot | undefined {
    const envText = readStorageValue<string>(TOOL_ID, 'envText', 'session');
    if (!envText) return undefined;
    const rulesText = readStorageValue<string>(TOOL_ID, 'rulesText', 'local') ?? '';
    return { state: { envText, rulesText }, summary: '.env validation' };
  },

  restore(state): void {
    if (typeof state['envText'] === 'string') writeStorageValue(TOOL_ID, 'envText', 'session', state['envText']);
    if (typeof state['rulesText'] === 'string') writeStorageValue(TOOL_ID, 'rulesText', 'local', state['rulesText']);
  },
};
