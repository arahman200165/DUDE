import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'csp-builder';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const raw = readStorageValue<string>(TOOL_ID, 'raw', 'session');
    if (!raw) return undefined;

    const preview = raw.length > 40 ? `${raw.slice(0, 40)}…` : raw;
    return { state: { raw }, summary: `CSP: "${preview}"` };
  },

  restore(state): void {
    if (typeof state['raw'] === 'string') writeStorageValue(TOOL_ID, 'raw', 'session', state['raw']);
  },
};
