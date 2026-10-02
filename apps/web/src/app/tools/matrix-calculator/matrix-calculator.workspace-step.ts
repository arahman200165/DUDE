import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'matrix-calculator';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const matrixA = readStorageValue<string>(TOOL_ID, 'matrixA', 'session');
    if (!matrixA) return undefined;

    const op = readStorageValue<string>(TOOL_ID, 'op', 'local') ?? 'mul';
    const matrixB = readStorageValue<string>(TOOL_ID, 'matrixB', 'session') ?? '';
    const scalar = readStorageValue<string>(TOOL_ID, 'scalar', 'session') ?? '';

    return { state: { op, matrixA, matrixB, scalar }, summary: `Matrix ${op}` };
  },

  restore(state): void {
    if (typeof state['op'] === 'string') writeStorageValue(TOOL_ID, 'op', 'local', state['op']);
    if (typeof state['matrixA'] === 'string') writeStorageValue(TOOL_ID, 'matrixA', 'session', state['matrixA']);
    if (typeof state['matrixB'] === 'string') writeStorageValue(TOOL_ID, 'matrixB', 'session', state['matrixB']);
    if (typeof state['scalar'] === 'string') writeStorageValue(TOOL_ID, 'scalar', 'session', state['scalar']);
  },
};
