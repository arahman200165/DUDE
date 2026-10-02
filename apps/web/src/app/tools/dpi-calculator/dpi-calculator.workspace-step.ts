import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'dpi-calculator';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const pixelWidth = readStorageValue<number>(TOOL_ID, 'pixel-width', 'session');
    if (pixelWidth === undefined) return undefined;

    const mode = readStorageValue<string>(TOOL_ID, 'mode', 'local') ?? 'find-dpi';
    const unit = readStorageValue<string>(TOOL_ID, 'unit', 'local') ?? 'in';
    const pixelHeight = readStorageValue<number>(TOOL_ID, 'pixel-height', 'session') ?? 0;
    const physicalWidth = readStorageValue<number>(TOOL_ID, 'physical-width', 'session') ?? 0;
    const physicalHeight = readStorageValue<number>(TOOL_ID, 'physical-height', 'session') ?? 0;
    const targetDpi = readStorageValue<number>(TOOL_ID, 'target-dpi', 'session') ?? 300;
    return {
      state: { mode, unit, pixelWidth, pixelHeight, physicalWidth, physicalHeight, targetDpi },
      summary: `DPI calc: ${pixelWidth}×${pixelHeight}px`,
    };
  },

  restore(state): void {
    if (typeof state['mode'] === 'string') writeStorageValue(TOOL_ID, 'mode', 'local', state['mode']);
    if (typeof state['unit'] === 'string') writeStorageValue(TOOL_ID, 'unit', 'local', state['unit']);
    if (typeof state['pixelWidth'] === 'number') writeStorageValue(TOOL_ID, 'pixel-width', 'session', state['pixelWidth']);
    if (typeof state['pixelHeight'] === 'number') writeStorageValue(TOOL_ID, 'pixel-height', 'session', state['pixelHeight']);
    if (typeof state['physicalWidth'] === 'number') writeStorageValue(TOOL_ID, 'physical-width', 'session', state['physicalWidth']);
    if (typeof state['physicalHeight'] === 'number') writeStorageValue(TOOL_ID, 'physical-height', 'session', state['physicalHeight']);
    if (typeof state['targetDpi'] === 'number') writeStorageValue(TOOL_ID, 'target-dpi', 'session', state['targetDpi']);
  },
};
