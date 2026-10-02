import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'range-header-builder';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const rangeRaw = readStorageValue<string>(TOOL_ID, 'rangeRaw', 'session');
    const contentRangeRaw = readStorageValue<string>(TOOL_ID, 'contentRangeRaw', 'session');
    if (!rangeRaw && !contentRangeRaw) return undefined;

    const preview = (rangeRaw ?? contentRangeRaw ?? '').slice(0, 40);
    return { state: { rangeRaw: rangeRaw ?? '', contentRangeRaw: contentRangeRaw ?? '' }, summary: `Range header: "${preview}"` };
  },

  restore(state): void {
    if (typeof state['rangeRaw'] === 'string') writeStorageValue(TOOL_ID, 'rangeRaw', 'session', state['rangeRaw']);
    if (typeof state['contentRangeRaw'] === 'string') writeStorageValue(TOOL_ID, 'contentRangeRaw', 'session', state['contentRangeRaw']);
  },
};
