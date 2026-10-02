import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { type FlattenDirection } from "@dude/tool-engine/tools/json-flatten/json-flatten-transform";

const TOOL_ID = 'json-flatten';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,
  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    if (!input) return undefined;
    const direction = readStorageValue<FlattenDirection>(TOOL_ID, 'direction', 'local') ?? 'flatten';
    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return { state: { input, direction }, summary: `${direction}: "${preview}"` };
  },
  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (typeof state['direction'] === 'string') writeStorageValue(TOOL_ID, 'direction', 'local', state['direction']);
  },
};
