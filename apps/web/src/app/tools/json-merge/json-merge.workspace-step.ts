import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { type JsonMergeStrategy } from "@dude/tool-engine/tools/json-merge/json-merge-transform";

const TOOL_ID = 'json-merge';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,
  snapshot(): WorkspaceSnapshot | undefined {
    const baseInput = readStorageValue<string>(TOOL_ID, 'baseInput', 'session');
    const overlayInput = readStorageValue<string>(TOOL_ID, 'overlayInput', 'session');
    if (!baseInput && !overlayInput) return undefined;
    const strategy = readStorageValue<JsonMergeStrategy>(TOOL_ID, 'strategy', 'local') ?? 'deep';
    return { state: { baseInput: baseInput ?? '', overlayInput: overlayInput ?? '', strategy }, summary: `JSON merge (${strategy})` };
  },
  restore(state): void {
    if (typeof state['baseInput'] === 'string') writeStorageValue(TOOL_ID, 'baseInput', 'session', state['baseInput']);
    if (typeof state['overlayInput'] === 'string') writeStorageValue(TOOL_ID, 'overlayInput', 'session', state['overlayInput']);
    if (typeof state['strategy'] === 'string') writeStorageValue(TOOL_ID, 'strategy', 'local', state['strategy']);
  },
};
