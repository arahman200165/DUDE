import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'resolution-calculator';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const width = readStorageValue<number>(TOOL_ID, 'width', 'session');
    const height = readStorageValue<number>(TOOL_ID, 'height', 'session');
    if (width === undefined || height === undefined) return undefined;
    return { state: { width, height }, summary: `Resolution: ${width}×${height}` };
  },

  restore(state): void {
    if (typeof state['width'] === 'number') writeStorageValue(TOOL_ID, 'width', 'session', state['width']);
    if (typeof state['height'] === 'number') writeStorageValue(TOOL_ID, 'height', 'session', state['height']);
  },
};
