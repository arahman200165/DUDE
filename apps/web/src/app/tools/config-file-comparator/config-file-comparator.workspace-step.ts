import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { ConfigFormat } from "@dude/tool-engine/tools/config-file-comparator/config-file-comparator-logic";

const TOOL_ID = 'config-file-comparator';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const before = readStorageValue<string>(TOOL_ID, 'before', 'session');
    const after = readStorageValue<string>(TOOL_ID, 'after', 'session');
    if (!before && !after) return undefined;
    const format = readStorageValue<ConfigFormat>(TOOL_ID, 'format', 'local') ?? 'env';

    return { state: { before, after, format }, summary: `Diffing two ${format} files` };
  },

  restore(state): void {
    if (typeof state['before'] === 'string') writeStorageValue(TOOL_ID, 'before', 'session', state['before']);
    if (typeof state['after'] === 'string') writeStorageValue(TOOL_ID, 'after', 'session', state['after']);
    if (state['format'] === 'env' || state['format'] === 'ini' || state['format'] === 'properties') {
      writeStorageValue(TOOL_ID, 'format', 'local', state['format']);
    }
  },
};
