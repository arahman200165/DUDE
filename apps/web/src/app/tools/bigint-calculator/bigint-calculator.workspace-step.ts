import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'bigint-calculator';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const inputA = readStorageValue<string>(TOOL_ID, 'inputA', 'session');
    if (!inputA) return undefined;

    const op = readStorageValue<string>(TOOL_ID, 'op', 'local') ?? 'pow';
    const inputB = readStorageValue<string>(TOOL_ID, 'inputB', 'session') ?? '';

    return { state: { op, inputA, inputB }, summary: `${inputA} ${op} ${inputB}` };
  },

  restore(state): void {
    if (typeof state['op'] === 'string') writeStorageValue(TOOL_ID, 'op', 'local', state['op']);
    if (typeof state['inputA'] === 'string') writeStorageValue(TOOL_ID, 'inputA', 'session', state['inputA']);
    if (typeof state['inputB'] === 'string') writeStorageValue(TOOL_ID, 'inputB', 'session', state['inputB']);
  },
};
