import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'resx-tool';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const mode = readStorageValue<string>(TOOL_ID, 'mode', 'local') ?? 'view';
    const baseInput = readStorageValue<string>(TOOL_ID, 'baseInput', 'session');
    const overlayInput = readStorageValue<string>(TOOL_ID, 'overlayInput', 'session') ?? '';
    if (!baseInput) return undefined;

    return { state: { mode, baseInput, overlayInput }, summary: `.resx ${mode}` };
  },

  restore(state): void {
    if (typeof state['mode'] === 'string') writeStorageValue(TOOL_ID, 'mode', 'local', state['mode']);
    if (typeof state['baseInput'] === 'string') writeStorageValue(TOOL_ID, 'baseInput', 'session', state['baseInput']);
    if (typeof state['overlayInput'] === 'string') writeStorageValue(TOOL_ID, 'overlayInput', 'session', state['overlayInput']);
  },
};
