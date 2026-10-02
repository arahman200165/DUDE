import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'html-jsx-converter';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    const direction = readStorageValue<'html-to-jsx' | 'jsx-to-html'>(TOOL_ID, 'direction', 'local') ?? 'html-to-jsx';
    if (!input) return undefined;

    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return { state: { input, direction }, summary: `${direction}: "${preview}"` };
  },

  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (typeof state['direction'] === 'string') writeStorageValue(TOOL_ID, 'direction', 'local', state['direction']);
  },
};
