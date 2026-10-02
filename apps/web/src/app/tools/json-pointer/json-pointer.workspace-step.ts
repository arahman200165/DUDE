import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'json-pointer';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const jsonInput = readStorageValue<string>(TOOL_ID, 'jsonInput', 'session');
    if (!jsonInput) return undefined;

    const pointer = readStorageValue<string>(TOOL_ID, 'pointer', 'local') ?? '';
    const paneRatio = readStorageValue<number>(TOOL_ID, 'paneRatio', 'local') ?? 0.5;
    return { state: { jsonInput, pointer, paneRatio }, summary: `JSON Pointer "${pointer}"` };
  },

  restore(state): void {
    if (typeof state['jsonInput'] === 'string') writeStorageValue(TOOL_ID, 'jsonInput', 'session', state['jsonInput']);
    if (typeof state['pointer'] === 'string') writeStorageValue(TOOL_ID, 'pointer', 'local', state['pointer']);
    if (typeof state['paneRatio'] === 'number') writeStorageValue(TOOL_ID, 'paneRatio', 'local', state['paneRatio']);
  },
};
