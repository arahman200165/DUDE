import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'border-radius-generator';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const corners = readStorageValue<Record<string, unknown>>(TOOL_ID, 'corners', 'session');
    if (!corners) return undefined;

    const unit = readStorageValue<string>(TOOL_ID, 'unit', 'local') ?? 'px';
    const linked = readStorageValue<boolean>(TOOL_ID, 'linked', 'local') ?? true;
    return { state: { corners, unit, linked }, summary: `Border radius (${unit})` };
  },

  restore(state): void {
    if (typeof state['corners'] === 'object' && state['corners'] !== null) writeStorageValue(TOOL_ID, 'corners', 'session', state['corners']);
    if (typeof state['unit'] === 'string') writeStorageValue(TOOL_ID, 'unit', 'local', state['unit']);
    if (typeof state['linked'] === 'boolean') writeStorageValue(TOOL_ID, 'linked', 'local', state['linked']);
  },
};
