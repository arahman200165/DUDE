import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { GridContainerSettings, GridItemSettings } from "@dude/tool-engine/tools/css-grid-playground/css-grid-logic";

const TOOL_ID = 'css-grid-playground';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const container = readStorageValue<GridContainerSettings>(TOOL_ID, 'container', 'session');
    const items = readStorageValue<readonly GridItemSettings[]>(TOOL_ID, 'items', 'session');
    if (!container) return undefined;

    return { state: { container, items: items ?? [] }, summary: `CSS Grid: ${container.columns} x ${container.rows}` };
  },

  restore(state): void {
    if (state['container'] && typeof state['container'] === 'object') {
      writeStorageValue(TOOL_ID, 'container', 'session', state['container']);
    }
    if (Array.isArray(state['items'])) {
      writeStorageValue(TOOL_ID, 'items', 'session', state['items']);
    }
  },
};
