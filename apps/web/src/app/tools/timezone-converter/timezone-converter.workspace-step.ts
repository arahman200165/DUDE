import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'timezone-converter';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const date = readStorageValue<string>(TOOL_ID, 'date', 'session');
    const time = readStorageValue<string>(TOOL_ID, 'time', 'session');
    if (!date || !time) return undefined;

    const sourceZone = readStorageValue<string>(TOOL_ID, 'sourceZone', 'local') ?? 'UTC';
    const targetZones = readStorageValue<readonly string[]>(TOOL_ID, 'targetZones', 'local') ?? ['UTC'];
    return { state: { date, time, sourceZone, targetZones }, summary: `${date} ${time} (${sourceZone})` };
  },

  restore(state): void {
    if (typeof state['date'] === 'string') writeStorageValue(TOOL_ID, 'date', 'session', state['date']);
    if (typeof state['time'] === 'string') writeStorageValue(TOOL_ID, 'time', 'session', state['time']);
    if (typeof state['sourceZone'] === 'string') writeStorageValue(TOOL_ID, 'sourceZone', 'local', state['sourceZone']);
    if (Array.isArray(state['targetZones'])) writeStorageValue(TOOL_ID, 'targetZones', 'local', state['targetZones']);
  },
};
