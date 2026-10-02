import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'csv-filter-sort';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    const filterColumn = readStorageValue<string>(TOOL_ID, 'filterColumn', 'session') ?? '';
    const operator = readStorageValue<string>(TOOL_ID, 'operator', 'local') ?? 'contains';
    const filterValue = readStorageValue<string>(TOOL_ID, 'filterValue', 'session') ?? '';
    const sortColumn = readStorageValue<string>(TOOL_ID, 'sortColumn', 'session') ?? '';
    const sortDirection = readStorageValue<string>(TOOL_ID, 'sortDirection', 'local') ?? 'asc';
    if (!input) return undefined;

    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return {
      state: { input, filterColumn, operator, filterValue, sortColumn, sortDirection },
      summary: `Filter/sort CSV: "${preview}"`,
    };
  },

  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (typeof state['filterColumn'] === 'string') writeStorageValue(TOOL_ID, 'filterColumn', 'session', state['filterColumn']);
    if (typeof state['operator'] === 'string') writeStorageValue(TOOL_ID, 'operator', 'local', state['operator']);
    if (typeof state['filterValue'] === 'string') writeStorageValue(TOOL_ID, 'filterValue', 'session', state['filterValue']);
    if (typeof state['sortColumn'] === 'string') writeStorageValue(TOOL_ID, 'sortColumn', 'session', state['sortColumn']);
    if (typeof state['sortDirection'] === 'string') writeStorageValue(TOOL_ID, 'sortDirection', 'local', state['sortDirection']);
  },
};
