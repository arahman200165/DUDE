import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'svg-viewer';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const source = readStorageValue<string>(TOOL_ID, 'source', 'session');
    if (!source) return undefined;

    const mode = readStorageValue<string>(TOOL_ID, 'mode', 'local') ?? 'format';
    return { state: { source, mode }, summary: `SVG (${mode})` };
  },

  restore(state): void {
    if (typeof state['source'] === 'string') writeStorageValue(TOOL_ID, 'source', 'session', state['source']);
    if (typeof state['mode'] === 'string') writeStorageValue(TOOL_ID, 'mode', 'local', state['mode']);
  },
};
