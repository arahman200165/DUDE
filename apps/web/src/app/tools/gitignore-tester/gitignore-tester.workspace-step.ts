import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'gitignore-tester';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const gitignore = readStorageValue<string>(TOOL_ID, 'gitignore', 'session');
    const paths = readStorageValue<string>(TOOL_ID, 'paths', 'session');
    if (!gitignore && !paths) return undefined;
    return { state: { gitignore: gitignore ?? '', paths: paths ?? '' }, summary: 'Gitignore path test' };
  },

  restore(state): void {
    if (typeof state['gitignore'] === 'string') writeStorageValue(TOOL_ID, 'gitignore', 'session', state['gitignore']);
    if (typeof state['paths'] === 'string') writeStorageValue(TOOL_ID, 'paths', 'session', state['paths']);
  },
};
