import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'cron';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const expression = readStorageValue<string>(TOOL_ID, 'expression', 'session');
    if (!expression) return undefined;

    const occurrenceCount = readStorageValue<number>(TOOL_ID, 'occurrenceCount', 'local') ?? 5;
    const tzMode = readStorageValue<string>(TOOL_ID, 'tzMode', 'local') ?? 'local';
    const direction = readStorageValue<string>(TOOL_ID, 'direction', 'local') ?? 'next';
    return { state: { expression, occurrenceCount, tzMode, direction }, summary: `Cron: "${expression}"` };
  },

  restore(state): void {
    if (typeof state['expression'] === 'string') writeStorageValue(TOOL_ID, 'expression', 'session', state['expression']);
    if (typeof state['occurrenceCount'] === 'number') writeStorageValue(TOOL_ID, 'occurrenceCount', 'local', state['occurrenceCount']);
    if (typeof state['tzMode'] === 'string') writeStorageValue(TOOL_ID, 'tzMode', 'local', state['tzMode']);
    if (typeof state['direction'] === 'string') writeStorageValue(TOOL_ID, 'direction', 'local', state['direction']);
  },
};
