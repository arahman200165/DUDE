import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'http-status';

/** Reference/lookup tool (static status-code table) — not History-eligible, per core/history/AGENTS.md. */
export const workspaceStep: WorkspaceStep = {
  snapshot(): WorkspaceSnapshot | undefined {
    const filterText = readStorageValue<string>(TOOL_ID, 'filterText', 'local');
    if (!filterText) return undefined;
    return { state: { filterText }, summary: `HTTP status filter: "${filterText}"` };
  },

  restore(state): void {
    if (typeof state['filterText'] === 'string') writeStorageValue(TOOL_ID, 'filterText', 'local', state['filterText']);
  },
};
