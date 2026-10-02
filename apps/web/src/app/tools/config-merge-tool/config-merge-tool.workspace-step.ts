import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { ConfigSource } from "@dude/tool-engine/tools/config-merge-tool/config-merge-tool-logic";

const TOOL_ID = 'config-merge-tool';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const sources = readStorageValue<readonly ConfigSource[]>(TOOL_ID, 'sources', 'session');
    if (!sources || sources.length === 0) return undefined;

    return { state: { sources }, summary: `Merging ${sources.length} config source${sources.length === 1 ? '' : 's'}` };
  },

  restore(state): void {
    if (Array.isArray(state['sources'])) writeStorageValue(TOOL_ID, 'sources', 'session', state['sources']);
  },
};
