import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'jsonl-viewer';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    if (!input) return undefined;

    const viewMode = readStorageValue<'table' | 'array'>(TOOL_ID, 'viewMode', 'local') ?? 'table';
    const paneRatio = readStorageValue<number>(TOOL_ID, 'paneRatio', 'local') ?? 0.5;
    const lineCount = input.split('\n').filter((line) => line.trim() !== '').length;
    return { state: { input, viewMode, paneRatio }, summary: `JSONL (${lineCount} lines)` };
  },

  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (state['viewMode'] === 'table' || state['viewMode'] === 'array') writeStorageValue(TOOL_ID, 'viewMode', 'local', state['viewMode']);
    if (typeof state['paneRatio'] === 'number') writeStorageValue(TOOL_ID, 'paneRatio', 'local', state['paneRatio']);
  },
};
