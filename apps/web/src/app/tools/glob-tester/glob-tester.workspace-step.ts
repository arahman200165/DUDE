import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'glob-tester';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const pattern = readStorageValue<string>(TOOL_ID, 'pattern', 'session');
    if (!pattern) return undefined;

    const paths = readStorageValue<string>(TOOL_ID, 'paths', 'session') ?? '';
    const dot = readStorageValue<boolean>(TOOL_ID, 'dot', 'local') ?? false;
    const nocase = readStorageValue<boolean>(TOOL_ID, 'nocase', 'local') ?? false;
    const treatBackslashAsSeparator = readStorageValue<boolean>(TOOL_ID, 'treatBackslashAsSeparator', 'local') ?? true;
    return { state: { pattern, paths, dot, nocase, treatBackslashAsSeparator }, summary: `Glob: "${pattern}"` };
  },

  restore(state): void {
    if (typeof state['pattern'] === 'string') writeStorageValue(TOOL_ID, 'pattern', 'session', state['pattern']);
    if (typeof state['paths'] === 'string') writeStorageValue(TOOL_ID, 'paths', 'session', state['paths']);
    if (typeof state['dot'] === 'boolean') writeStorageValue(TOOL_ID, 'dot', 'local', state['dot']);
    if (typeof state['nocase'] === 'boolean') writeStorageValue(TOOL_ID, 'nocase', 'local', state['nocase']);
    if (typeof state['treatBackslashAsSeparator'] === 'boolean') {
      writeStorageValue(TOOL_ID, 'treatBackslashAsSeparator', 'local', state['treatBackslashAsSeparator']);
    }
  },
};
