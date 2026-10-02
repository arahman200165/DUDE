import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'csv-cleaner';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    const trimCells = readStorageValue<boolean>(TOOL_ID, 'trimCells', 'local') ?? true;
    const dropEmptyRows = readStorageValue<boolean>(TOOL_ID, 'dropEmptyRows', 'local') ?? true;
    const paneRatio = readStorageValue<number>(TOOL_ID, 'paneRatio', 'local') ?? 0.5;
    if (!input) return undefined;

    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return { state: { input, trimCells, dropEmptyRows, paneRatio }, summary: `Cleaning CSV: "${preview}"` };
  },

  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (typeof state['trimCells'] === 'boolean') writeStorageValue(TOOL_ID, 'trimCells', 'local', state['trimCells']);
    if (typeof state['dropEmptyRows'] === 'boolean') writeStorageValue(TOOL_ID, 'dropEmptyRows', 'local', state['dropEmptyRows']);
    if (typeof state['paneRatio'] === 'number') writeStorageValue(TOOL_ID, 'paneRatio', 'local', state['paneRatio']);
  },
};
