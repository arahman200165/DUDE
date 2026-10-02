import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'csv-pivot';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    const rowKeyColumn = readStorageValue<string>(TOOL_ID, 'rowKeyColumn', 'session') ?? '';
    const columnKeyColumn = readStorageValue<string>(TOOL_ID, 'columnKeyColumn', 'session') ?? '';
    const valueColumn = readStorageValue<string>(TOOL_ID, 'valueColumn', 'session') ?? '';
    const aggregation = readStorageValue<string>(TOOL_ID, 'aggregation', 'local') ?? 'sum';
    if (!input) return undefined;

    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return { state: { input, rowKeyColumn, columnKeyColumn, valueColumn, aggregation }, summary: `Pivot CSV (${aggregation}): "${preview}"` };
  },

  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (typeof state['rowKeyColumn'] === 'string') writeStorageValue(TOOL_ID, 'rowKeyColumn', 'session', state['rowKeyColumn']);
    if (typeof state['columnKeyColumn'] === 'string') writeStorageValue(TOOL_ID, 'columnKeyColumn', 'session', state['columnKeyColumn']);
    if (typeof state['valueColumn'] === 'string') writeStorageValue(TOOL_ID, 'valueColumn', 'session', state['valueColumn']);
    if (typeof state['aggregation'] === 'string') writeStorageValue(TOOL_ID, 'aggregation', 'local', state['aggregation']);
  },
};
