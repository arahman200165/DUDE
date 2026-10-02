import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'recurrence-rule';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const ruleText = readStorageValue<string>(TOOL_ID, 'ruleText', 'session');
    if (!ruleText) return undefined;

    const startDate = readStorageValue<string>(TOOL_ID, 'startDate', 'session') ?? '';
    const startTime = readStorageValue<string>(TOOL_ID, 'startTime', 'session') ?? '';
    const timezone = readStorageValue<string>(TOOL_ID, 'timezone', 'local') ?? 'UTC';
    const maxOccurrences = readStorageValue<number>(TOOL_ID, 'maxOccurrences', 'local') ?? 10;
    return { state: { startDate, startTime, ruleText, timezone, maxOccurrences }, summary: `Recurrence: "${ruleText}"` };
  },

  restore(state): void {
    if (typeof state['startDate'] === 'string') writeStorageValue(TOOL_ID, 'startDate', 'session', state['startDate']);
    if (typeof state['startTime'] === 'string') writeStorageValue(TOOL_ID, 'startTime', 'session', state['startTime']);
    if (typeof state['ruleText'] === 'string') writeStorageValue(TOOL_ID, 'ruleText', 'session', state['ruleText']);
    if (typeof state['timezone'] === 'string') writeStorageValue(TOOL_ID, 'timezone', 'local', state['timezone']);
    if (typeof state['maxOccurrences'] === 'number') writeStorageValue(TOOL_ID, 'maxOccurrences', 'local', state['maxOccurrences']);
  },
};
