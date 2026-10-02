import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'text-inspector';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const text = readStorageValue<string>(TOOL_ID, 'text', 'session');
    if (!text) return undefined;

    const preview = text.length > 40 ? `${text.slice(0, 40)}…` : text;
    return { state: { text }, summary: `Inspected "${preview}"` };
  },

  restore(state): void {
    if (typeof state['text'] === 'string') {
      writeStorageValue(TOOL_ID, 'text', 'session', state['text']);
    }
  },
};
