import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'missing-env-var-detector';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const sourceText = readStorageValue<string>(TOOL_ID, 'sourceText', 'session');
    const envText = readStorageValue<string>(TOOL_ID, 'envText', 'session');
    if (!sourceText && !envText) return undefined;

    return { state: { sourceText, envText }, summary: 'Missing env var check' };
  },

  restore(state): void {
    if (typeof state['sourceText'] === 'string') writeStorageValue(TOOL_ID, 'sourceText', 'session', state['sourceText']);
    if (typeof state['envText'] === 'string') writeStorageValue(TOOL_ID, 'envText', 'session', state['envText']);
  },
};
