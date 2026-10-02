import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { TransformState } from "@dude/tool-engine/tools/css-transform-builder/css-transform-logic";

const TOOL_ID = 'css-transform-builder';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const state = readStorageValue<TransformState>(TOOL_ID, 'state', 'session');
    if (!state) return undefined;

    return { state: { state }, summary: `CSS transform (origin: ${state.origin})` };
  },

  restore(state): void {
    if (state['state'] && typeof state['state'] === 'object') {
      writeStorageValue(TOOL_ID, 'state', 'session', state['state']);
    }
  },
};
