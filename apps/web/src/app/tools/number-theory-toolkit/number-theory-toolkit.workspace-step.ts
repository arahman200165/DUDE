import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'number-theory-toolkit';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const modA = readStorageValue<string>(TOOL_ID, 'modA', 'session');
    const gcdLcmInput = readStorageValue<string>(TOOL_ID, 'gcdLcmInput', 'session');
    const primeInput = readStorageValue<string>(TOOL_ID, 'primeInput', 'session');
    if (!modA && !gcdLcmInput && !primeInput) return undefined;

    const tab = readStorageValue<string>(TOOL_ID, 'tab', 'local') ?? 'modular';
    const state = {
      tab,
      modOp: readStorageValue<string>(TOOL_ID, 'modOp', 'local') ?? 'pow',
      modA,
      modB: readStorageValue<string>(TOOL_ID, 'modB', 'session'),
      modM: readStorageValue<string>(TOOL_ID, 'modM', 'session'),
      gcdLcmInput,
      primeInput,
    };
    return { state, summary: `Number theory (${tab})` };
  },

  restore(state): void {
    if (typeof state['tab'] === 'string') writeStorageValue(TOOL_ID, 'tab', 'local', state['tab']);
    if (typeof state['modOp'] === 'string') writeStorageValue(TOOL_ID, 'modOp', 'local', state['modOp']);
    for (const key of ['modA', 'modB', 'modM', 'gcdLcmInput', 'primeInput'] as const) {
      if (typeof state[key] === 'string') writeStorageValue(TOOL_ID, key, 'session', state[key]);
    }
  },
};
