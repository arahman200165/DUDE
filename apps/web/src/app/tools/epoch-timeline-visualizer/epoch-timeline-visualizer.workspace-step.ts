import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'epoch-timeline-visualizer';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const multiText = readStorageValue<string>(TOOL_ID, 'multiText', 'session');
    if (!multiText) return undefined;

    const mode = readStorageValue<string>(TOOL_ID, 'mode', 'local') ?? 'multi';
    const includeNow = readStorageValue<boolean>(TOOL_ID, 'includeNow', 'local') ?? true;
    const rangeStart = readStorageValue<string>(TOOL_ID, 'rangeStart', 'session') ?? '';
    const rangeEnd = readStorageValue<string>(TOOL_ID, 'rangeEnd', 'session') ?? '';
    return { state: { mode, includeNow, multiText, rangeStart, rangeEnd }, summary: `Epoch timeline (${mode})` };
  },

  restore(state): void {
    if (typeof state['mode'] === 'string') writeStorageValue(TOOL_ID, 'mode', 'local', state['mode']);
    if (typeof state['includeNow'] === 'boolean') writeStorageValue(TOOL_ID, 'includeNow', 'local', state['includeNow']);
    if (typeof state['multiText'] === 'string') writeStorageValue(TOOL_ID, 'multiText', 'session', state['multiText']);
    if (typeof state['rangeStart'] === 'string') writeStorageValue(TOOL_ID, 'rangeStart', 'session', state['rangeStart']);
    if (typeof state['rangeEnd'] === 'string') writeStorageValue(TOOL_ID, 'rangeEnd', 'session', state['rangeEnd']);
  },
};
