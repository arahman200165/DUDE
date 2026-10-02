import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'aspect-ratio-calculator';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const width = readStorageValue<number>(TOOL_ID, 'width', 'session');
    if (width === undefined) return undefined;

    const mode = readStorageValue<string>(TOOL_ID, 'mode', 'local') ?? 'simplify';
    const solveFor = readStorageValue<string>(TOOL_ID, 'solve-for', 'local') ?? 'height';
    const height = readStorageValue<number>(TOOL_ID, 'height', 'session') ?? 0;
    const targetRatio = readStorageValue<string>(TOOL_ID, 'target-ratio', 'session') ?? '16:9';
    const knownDimension = readStorageValue<number>(TOOL_ID, 'known-dimension', 'session') ?? 0;
    return {
      state: { mode, solveFor, width, height, targetRatio, knownDimension },
      summary: `Aspect ratio: ${width}×${height}`,
    };
  },

  restore(state): void {
    if (typeof state['mode'] === 'string') writeStorageValue(TOOL_ID, 'mode', 'local', state['mode']);
    if (typeof state['solveFor'] === 'string') writeStorageValue(TOOL_ID, 'solve-for', 'local', state['solveFor']);
    if (typeof state['width'] === 'number') writeStorageValue(TOOL_ID, 'width', 'session', state['width']);
    if (typeof state['height'] === 'number') writeStorageValue(TOOL_ID, 'height', 'session', state['height']);
    if (typeof state['targetRatio'] === 'string') writeStorageValue(TOOL_ID, 'target-ratio', 'session', state['targetRatio']);
    if (typeof state['knownDimension'] === 'number') writeStorageValue(TOOL_ID, 'known-dimension', 'session', state['knownDimension']);
  },
};
