import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'date-calculator';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const rangeStartDate = readStorageValue<string>(TOOL_ID, 'rangeStartDate', 'session') ?? '';
    const rangeEndDate = readStorageValue<string>(TOOL_ID, 'rangeEndDate', 'session') ?? '';
    const addStartDate = readStorageValue<string>(TOOL_ID, 'addStartDate', 'session') ?? '';
    const amount = readStorageValue<number>(TOOL_ID, 'amount', 'session') ?? 0;
    const holidaysText = readStorageValue<string>(TOOL_ID, 'holidaysText', 'session') ?? '';
    if (!rangeStartDate && !addStartDate) return undefined;

    const addMode = readStorageValue<string>(TOOL_ID, 'addMode', 'local') ?? 'calendar';
    return {
      state: { addStartDate, amount, addMode, rangeStartDate, rangeEndDate, holidaysText },
      summary: `Date calc: ${addStartDate || rangeStartDate}`,
    };
  },

  restore(state): void {
    if (typeof state['addStartDate'] === 'string') writeStorageValue(TOOL_ID, 'addStartDate', 'session', state['addStartDate']);
    if (typeof state['amount'] === 'number') writeStorageValue(TOOL_ID, 'amount', 'session', state['amount']);
    if (typeof state['addMode'] === 'string') writeStorageValue(TOOL_ID, 'addMode', 'local', state['addMode']);
    if (typeof state['rangeStartDate'] === 'string') writeStorageValue(TOOL_ID, 'rangeStartDate', 'session', state['rangeStartDate']);
    if (typeof state['rangeEndDate'] === 'string') writeStorageValue(TOOL_ID, 'rangeEndDate', 'session', state['rangeEndDate']);
    if (typeof state['holidaysText'] === 'string') writeStorageValue(TOOL_ID, 'holidaysText', 'session', state['holidaysText']);
  },
};
