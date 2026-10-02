import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { WhitespaceCleanOptions } from "@dude/tool-engine/tools/whitespace-cleaner/whitespace-clean";

const TOOL_ID = 'whitespace-cleaner';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    if (!input) return undefined;

    const options = readStorageValue<WhitespaceCleanOptions>(TOOL_ID, 'options', 'local');
    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return { state: { input, options }, summary: `Cleaned "${preview}"` };
  },

  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (state['options'] && typeof state['options'] === 'object') {
      writeStorageValue(TOOL_ID, 'options', 'local', state['options']);
    }
  },
};
