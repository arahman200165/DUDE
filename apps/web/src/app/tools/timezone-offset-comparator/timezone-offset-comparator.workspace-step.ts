import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'timezone-offset-comparator';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const gridZonesText = readStorageValue<string>(TOOL_ID, 'gridZonesText', 'session');
    const momentInput = readStorageValue<string>(TOOL_ID, 'momentInput', 'session');
    if (!gridZonesText && !momentInput) return undefined;

    const mode = readStorageValue<string>(TOOL_ID, 'mode', 'local') ?? 'grid';
    const gridYear = readStorageValue<number>(TOOL_ID, 'gridYear', 'session') ?? new Date().getFullYear();
    const zoneA = readStorageValue<string>(TOOL_ID, 'zoneA', 'local') ?? 'UTC';
    const zoneB = readStorageValue<string>(TOOL_ID, 'zoneB', 'local') ?? 'UTC';
    return {
      state: { mode, gridZonesText: gridZonesText ?? '', gridYear, zoneA, zoneB, momentInput: momentInput ?? '' },
      summary: `Timezone offsets (${mode})`,
    };
  },

  restore(state): void {
    if (typeof state['mode'] === 'string') writeStorageValue(TOOL_ID, 'mode', 'local', state['mode']);
    if (typeof state['gridZonesText'] === 'string') writeStorageValue(TOOL_ID, 'gridZonesText', 'session', state['gridZonesText']);
    if (typeof state['gridYear'] === 'number') writeStorageValue(TOOL_ID, 'gridYear', 'session', state['gridYear']);
    if (typeof state['zoneA'] === 'string') writeStorageValue(TOOL_ID, 'zoneA', 'local', state['zoneA']);
    if (typeof state['zoneB'] === 'string') writeStorageValue(TOOL_ID, 'zoneB', 'local', state['zoneB']);
    if (typeof state['momentInput'] === 'string') writeStorageValue(TOOL_ID, 'momentInput', 'session', state['momentInput']);
  },
};
