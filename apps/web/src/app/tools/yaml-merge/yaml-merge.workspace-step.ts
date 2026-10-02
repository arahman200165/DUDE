import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'yaml-merge';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const baseInput = readStorageValue<string>(TOOL_ID, 'baseInput', 'session');
    const overlayInput = readStorageValue<string>(TOOL_ID, 'overlayInput', 'session') ?? '';
    if (!baseInput) return undefined;

    const preview = baseInput.length > 40 ? `${baseInput.slice(0, 40)}…` : baseInput;
    return { state: { baseInput, overlayInput }, summary: `Merging YAML: "${preview}"` };
  },

  restore(state): void {
    if (typeof state['baseInput'] === 'string') writeStorageValue(TOOL_ID, 'baseInput', 'session', state['baseInput']);
    if (typeof state['overlayInput'] === 'string') writeStorageValue(TOOL_ID, 'overlayInput', 'session', state['overlayInput']);
  },
};
