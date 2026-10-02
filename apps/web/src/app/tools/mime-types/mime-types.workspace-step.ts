import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'mime-types';

/** Reference/lookup tool (static MIME type table) — not History-eligible, per core/history/AGENTS.md. */
export const workspaceStep: WorkspaceStep = {
  snapshot(): WorkspaceSnapshot | undefined {
    const filterText = readStorageValue<string>(TOOL_ID, 'filterText', 'local');
    const topLevelFilter = readStorageValue<string>(TOOL_ID, 'topLevelFilter', 'local') ?? 'all';
    if (!filterText) return undefined;
    return { state: { filterText, topLevelFilter }, summary: `MIME type filter: "${filterText}"` };
  },

  restore(state): void {
    if (typeof state['filterText'] === 'string') writeStorageValue(TOOL_ID, 'filterText', 'local', state['filterText']);
    if (typeof state['topLevelFilter'] === 'string') writeStorageValue(TOOL_ID, 'topLevelFilter', 'local', state['topLevelFilter']);
  },
};
