import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'week-number-calculator';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const dateInput = readStorageValue<string>(TOOL_ID, 'dateInput', 'session');
    if (!dateInput) return undefined;

    const weekYearInput = readStorageValue<number>(TOOL_ID, 'weekYearInput', 'session') ?? new Date().getFullYear();
    const weekNumberInput = readStorageValue<number>(TOOL_ID, 'weekNumberInput', 'session') ?? 1;
    const weekdayInput = readStorageValue<number>(TOOL_ID, 'weekdayInput', 'session') ?? 1;
    return { state: { dateInput, weekYearInput, weekNumberInput, weekdayInput }, summary: `Week number for ${dateInput}` };
  },

  restore(state): void {
    if (typeof state['dateInput'] === 'string') writeStorageValue(TOOL_ID, 'dateInput', 'session', state['dateInput']);
    if (typeof state['weekYearInput'] === 'number') writeStorageValue(TOOL_ID, 'weekYearInput', 'session', state['weekYearInput']);
    if (typeof state['weekNumberInput'] === 'number') writeStorageValue(TOOL_ID, 'weekNumberInput', 'session', state['weekNumberInput']);
    if (typeof state['weekdayInput'] === 'number') writeStorageValue(TOOL_ID, 'weekdayInput', 'session', state['weekdayInput']);
  },
};
