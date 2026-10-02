import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'cache-control-builder';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const raw = readStorageValue<string>(TOOL_ID, 'raw', 'session');
    if (!raw) return undefined;

    const context = readStorageValue<'request' | 'response'>(TOOL_ID, 'context', 'local') ?? 'response';
    const preview = raw.length > 40 ? `${raw.slice(0, 40)}…` : raw;
    return { state: { raw, context }, summary: `Cache-Control (${context}): "${preview}"` };
  },

  restore(state): void {
    if (typeof state['raw'] === 'string') writeStorageValue(TOOL_ID, 'raw', 'session', state['raw']);
    if (state['context'] === 'request' || state['context'] === 'response') {
      writeStorageValue(TOOL_ID, 'context', 'local', state['context']);
    }
  },
};
