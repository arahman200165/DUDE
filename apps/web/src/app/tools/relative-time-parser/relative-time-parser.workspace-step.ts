import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'relative-time-parser';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const textInput = readStorageValue<string>(TOOL_ID, 'textInput', 'session');
    if (!textInput) return undefined;

    const referenceInput = readStorageValue<string>(TOOL_ID, 'referenceInput', 'session') ?? '';
    const timestampInput = readStorageValue<string>(TOOL_ID, 'timestampInput', 'session') ?? '';
    return { state: { referenceInput, textInput, timestampInput }, summary: `Relative time: "${textInput}"` };
  },

  restore(state): void {
    if (typeof state['referenceInput'] === 'string') writeStorageValue(TOOL_ID, 'referenceInput', 'session', state['referenceInput']);
    if (typeof state['textInput'] === 'string') writeStorageValue(TOOL_ID, 'textInput', 'session', state['textInput']);
    if (typeof state['timestampInput'] === 'string') writeStorageValue(TOOL_ID, 'timestampInput', 'session', state['timestampInput']);
  },
};
