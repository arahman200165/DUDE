import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { SortOrder } from "@dude/tool-engine/tools/json-sort-keys/json-sort-keys-transform";

const TOOL_ID = 'json-sort-keys';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    if (!input) return undefined;

    const recursive = readStorageValue<boolean>(TOOL_ID, 'recursive', 'local') ?? true;
    const order = readStorageValue<SortOrder>(TOOL_ID, 'order', 'local') ?? 'asc';
    const paneRatio = readStorageValue<number>(TOOL_ID, 'paneRatio', 'local') ?? 0.5;
    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return { state: { input, recursive, order, paneRatio }, summary: `Sort keys (${order}): "${preview}"` };
  },

  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (typeof state['recursive'] === 'boolean') writeStorageValue(TOOL_ID, 'recursive', 'local', state['recursive']);
    if (state['order'] === 'asc' || state['order'] === 'desc') writeStorageValue(TOOL_ID, 'order', 'local', state['order']);
    if (typeof state['paneRatio'] === 'number') writeStorageValue(TOOL_ID, 'paneRatio', 'local', state['paneRatio']);
  },
};
