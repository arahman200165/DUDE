import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'json-patch-test';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,
  snapshot(): WorkspaceSnapshot | undefined {
    const documentInput = readStorageValue<string>(TOOL_ID, 'documentInput', 'session');
    const patchInput = readStorageValue<string>(TOOL_ID, 'patchInput', 'session');
    if (!documentInput && !patchInput) return undefined;
    return { state: { documentInput: documentInput ?? '', patchInput: patchInput ?? '' }, summary: 'JSON Patch test' };
  },
  restore(state): void {
    if (typeof state['documentInput'] === 'string') writeStorageValue(TOOL_ID, 'documentInput', 'session', state['documentInput']);
    if (typeof state['patchInput'] === 'string') writeStorageValue(TOOL_ID, 'patchInput', 'session', state['patchInput']);
  },
};
