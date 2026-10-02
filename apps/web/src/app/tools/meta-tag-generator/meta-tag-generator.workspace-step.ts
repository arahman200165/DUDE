import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { MetaTagSettings } from "@dude/tool-engine/tools/meta-tag-generator/meta-tag-logic";

const TOOL_ID = 'meta-tag-generator';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const settings = readStorageValue<MetaTagSettings>(TOOL_ID, 'settings', 'session');
    if (!settings || !settings.title) return undefined;

    return { state: { settings }, summary: `Meta tags: "${settings.title}"` };
  },

  restore(state): void {
    if (state['settings'] && typeof state['settings'] === 'object') {
      writeStorageValue(TOOL_ID, 'settings', 'session', state['settings']);
    }
  },
};
