import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'unicode-code-point-converter';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const mode = readStorageValue<'single' | 'bulk'>(TOOL_ID, 'mode', 'local') ?? 'single';
    const singleInput = readStorageValue<string>(TOOL_ID, 'singleInput', 'session') ?? '';
    const bulkInput = readStorageValue<string>(TOOL_ID, 'bulkInput', 'session') ?? '';
    if (!singleInput && !bulkInput) return undefined;

    const active = mode === 'bulk' ? bulkInput : singleInput;
    const preview = active.length > 40 ? `${active.slice(0, 40)}…` : active;
    return { state: { mode, singleInput, bulkInput }, summary: `Code points: "${preview}"` };
  },

  restore(state): void {
    if (state['mode'] === 'single' || state['mode'] === 'bulk') writeStorageValue(TOOL_ID, 'mode', 'local', state['mode']);
    if (typeof state['singleInput'] === 'string') writeStorageValue(TOOL_ID, 'singleInput', 'session', state['singleInput']);
    if (typeof state['bulkInput'] === 'string') writeStorageValue(TOOL_ID, 'bulkInput', 'session', state['bulkInput']);
  },
};
