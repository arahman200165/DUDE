import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { BezierPoints } from "@dude/tool-engine/tools/cubic-bezier-editor/cubic-bezier-logic";

const TOOL_ID = 'cubic-bezier-editor';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const points = readStorageValue<BezierPoints>(TOOL_ID, 'points', 'session');
    if (!points) return undefined;

    return { state: { points }, summary: `cubic-bezier(${points.x1}, ${points.y1}, ${points.x2}, ${points.y2})` };
  },

  restore(state): void {
    if (state['points'] && typeof state['points'] === 'object') {
      writeStorageValue(TOOL_ID, 'points', 'session', state['points']);
    }
  },
};
