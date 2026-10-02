import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'range-generator';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const start = readStorageValue<string>(TOOL_ID, 'start', 'session');
    const end = readStorageValue<string>(TOOL_ID, 'end', 'session');
    if (!start || !end) return undefined;

    const step = readStorageValue<string>(TOOL_ID, 'step', 'session') ?? '1';
    const padWidth = readStorageValue<number>(TOOL_ID, 'padWidth', 'local') ?? 0;
    const separator = readStorageValue<string>(TOOL_ID, 'separator', 'local') ?? 'newline';

    return { state: { start, end, step, padWidth, separator }, summary: `Range ${start}..${end} step ${step}` };
  },

  restore(state): void {
    if (typeof state['start'] === 'string') writeStorageValue(TOOL_ID, 'start', 'session', state['start']);
    if (typeof state['end'] === 'string') writeStorageValue(TOOL_ID, 'end', 'session', state['end']);
    if (typeof state['step'] === 'string') writeStorageValue(TOOL_ID, 'step', 'session', state['step']);
    if (typeof state['padWidth'] === 'number') writeStorageValue(TOOL_ID, 'padWidth', 'local', state['padWidth']);
    if (typeof state['separator'] === 'string') writeStorageValue(TOOL_ID, 'separator', 'local', state['separator']);
  },
};
