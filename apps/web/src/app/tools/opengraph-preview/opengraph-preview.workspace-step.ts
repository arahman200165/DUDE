import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { OgSettings } from "@dude/tool-engine/tools/opengraph-preview/opengraph-logic";

const TOOL_ID = 'opengraph-preview';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const settings = readStorageValue<OgSettings>(TOOL_ID, 'settings', 'session');
    if (!settings || !settings.title) return undefined;

    return { state: { settings }, summary: `OpenGraph: "${settings.title}"` };
  },

  restore(state): void {
    if (state['settings'] && typeof state['settings'] === 'object') {
      writeStorageValue(TOOL_ID, 'settings', 'session', state['settings']);
    }
  },
};
