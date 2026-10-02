import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { SortVariant } from "@dude/tool-engine/tools/line-order-tools/line-order-logic";

const TOOL_ID = 'line-order-tools';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    if (!input) return undefined;

    const operation = readStorageValue<'sort' | 'shuffle' | 'reverse'>(TOOL_ID, 'operation', 'local') ?? 'sort';
    const sortVariant = readStorageValue<SortVariant>(TOOL_ID, 'sortVariant', 'local') ?? 'asc';
    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return { state: { input, operation, sortVariant }, summary: `${operation}: "${preview}"` };
  },

  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (state['operation'] === 'sort' || state['operation'] === 'shuffle' || state['operation'] === 'reverse') {
      writeStorageValue(TOOL_ID, 'operation', 'local', state['operation']);
    }
    if (typeof state['sortVariant'] === 'string') writeStorageValue(TOOL_ID, 'sortVariant', 'local', state['sortVariant']);
  },
};
