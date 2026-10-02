import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'branch-name-generator';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const description = readStorageValue<string>(TOOL_ID, 'description', 'session');
    const ticket = readStorageValue<string>(TOOL_ID, 'ticket', 'session');
    if (!description && !ticket) return undefined;

    const type = readStorageValue<string>(TOOL_ID, 'type', 'local') ?? 'feature';
    const maxLength = readStorageValue<number>(TOOL_ID, 'maxLength', 'local') ?? 0;
    return {
      state: { type, ticket: ticket ?? '', description: description ?? '', maxLength },
      summary: `Branch name: ${type}/${ticket ?? ''}`,
    };
  },

  restore(state): void {
    if (typeof state['type'] === 'string') writeStorageValue(TOOL_ID, 'type', 'local', state['type']);
    if (typeof state['ticket'] === 'string') writeStorageValue(TOOL_ID, 'ticket', 'session', state['ticket']);
    if (typeof state['description'] === 'string') writeStorageValue(TOOL_ID, 'description', 'session', state['description']);
    if (typeof state['maxLength'] === 'number') writeStorageValue(TOOL_ID, 'maxLength', 'local', state['maxLength']);
  },
};
