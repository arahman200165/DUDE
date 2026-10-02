import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'csv-join';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const leftInput = readStorageValue<string>(TOOL_ID, 'leftInput', 'session');
    const rightInput = readStorageValue<string>(TOOL_ID, 'rightInput', 'session') ?? '';
    const leftKey = readStorageValue<string>(TOOL_ID, 'leftKey', 'session') ?? '';
    const rightKey = readStorageValue<string>(TOOL_ID, 'rightKey', 'session') ?? '';
    const joinType = readStorageValue<string>(TOOL_ID, 'joinType', 'local') ?? 'inner';
    if (!leftInput) return undefined;

    return { state: { leftInput, rightInput, leftKey, rightKey, joinType }, summary: `${joinType} join of two CSVs` };
  },

  restore(state): void {
    if (typeof state['leftInput'] === 'string') writeStorageValue(TOOL_ID, 'leftInput', 'session', state['leftInput']);
    if (typeof state['rightInput'] === 'string') writeStorageValue(TOOL_ID, 'rightInput', 'session', state['rightInput']);
    if (typeof state['leftKey'] === 'string') writeStorageValue(TOOL_ID, 'leftKey', 'session', state['leftKey']);
    if (typeof state['rightKey'] === 'string') writeStorageValue(TOOL_ID, 'rightKey', 'session', state['rightKey']);
    if (typeof state['joinType'] === 'string') writeStorageValue(TOOL_ID, 'joinType', 'local', state['joinType']);
  },
};
