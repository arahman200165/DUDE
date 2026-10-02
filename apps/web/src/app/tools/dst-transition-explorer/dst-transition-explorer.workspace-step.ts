import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'dst-transition-explorer';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const zone = readStorageValue<string>(TOOL_ID, 'zone', 'local');
    const year = readStorageValue<number>(TOOL_ID, 'year', 'session');
    if (!zone || !year) return undefined;
    return { state: { zone, year }, summary: `DST transitions: ${zone} (${year})` };
  },

  restore(state): void {
    if (typeof state['zone'] === 'string') writeStorageValue(TOOL_ID, 'zone', 'local', state['zone']);
    if (typeof state['year'] === 'number') writeStorageValue(TOOL_ID, 'year', 'session', state['year']);
  },
};
