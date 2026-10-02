import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'contrast-checker';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const foreground = readStorageValue<string>(TOOL_ID, 'foreground', 'session');
    const background = readStorageValue<string>(TOOL_ID, 'background', 'session');
    if (!foreground && !background) return undefined;
    return {
      state: { foreground: foreground ?? '#0f172a', background: background ?? '#ffffff' },
      summary: `Contrast: ${foreground ?? '#0f172a'} on ${background ?? '#ffffff'}`,
    };
  },

  restore(state): void {
    if (typeof state['foreground'] === 'string') writeStorageValue(TOOL_ID, 'foreground', 'session', state['foreground']);
    if (typeof state['background'] === 'string') writeStorageValue(TOOL_ID, 'background', 'session', state['background']);
  },
};
