import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'find-replace-text';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    if (!input) return undefined;

    const state = {
      input,
      find: readStorageValue<string>(TOOL_ID, 'find', 'session') ?? '',
      replace: readStorageValue<string>(TOOL_ID, 'replace', 'session') ?? '',
      caseSensitive: readStorageValue<boolean>(TOOL_ID, 'caseSensitive', 'local') ?? true,
      wholeWord: readStorageValue<boolean>(TOOL_ID, 'wholeWord', 'local') ?? false,
    };
    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return { state, summary: `Find/replace: "${preview}"` };
  },

  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (typeof state['find'] === 'string') writeStorageValue(TOOL_ID, 'find', 'session', state['find']);
    if (typeof state['replace'] === 'string') writeStorageValue(TOOL_ID, 'replace', 'session', state['replace']);
    if (typeof state['caseSensitive'] === 'boolean') writeStorageValue(TOOL_ID, 'caseSensitive', 'local', state['caseSensitive']);
    if (typeof state['wholeWord'] === 'boolean') writeStorageValue(TOOL_ID, 'wholeWord', 'local', state['wholeWord']);
  },
};
