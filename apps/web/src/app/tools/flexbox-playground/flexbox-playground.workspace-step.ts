import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { FlexContainerSettings, FlexItemSettings } from "@dude/tool-engine/tools/flexbox-playground/flexbox-logic";

const TOOL_ID = 'flexbox-playground';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const container = readStorageValue<FlexContainerSettings>(TOOL_ID, 'container', 'session');
    const items = readStorageValue<readonly FlexItemSettings[]>(TOOL_ID, 'items', 'session');
    if (!container) return undefined;

    return { state: { container, items: items ?? [] }, summary: `Flexbox: ${container.direction}` };
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
