import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'subnet-calculator';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const base = readStorageValue<string>(TOOL_ID, 'base', 'session');
    if (!base) return undefined;

    const mode = readStorageValue<string>(TOOL_ID, 'mode', 'local') ?? 'count';
    const param = readStorageValue<number>(TOOL_ID, 'param', 'local') ?? 4;
    return { state: { base, mode, param }, summary: `Subnet split: ${base}` };
  },

  restore(state): void {
    if (typeof state['base'] === 'string') writeStorageValue(TOOL_ID, 'base', 'session', state['base']);
    if (typeof state['mode'] === 'string') writeStorageValue(TOOL_ID, 'mode', 'local', state['mode']);
    if (typeof state['param'] === 'number') writeStorageValue(TOOL_ID, 'param', 'local', state['param']);
  },
};
