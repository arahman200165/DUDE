import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { HtmlFormatMode } from './html-format-logic';

const TOOL_ID = 'html-formatter';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    const mode = readStorageValue<HtmlFormatMode>(TOOL_ID, 'mode', 'local') ?? 'pretty';
    if (!input) return undefined;

    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return { state: { input, mode }, summary: `HTML (${mode}): "${preview}"` };
  },

  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (typeof state['mode'] === 'string') writeStorageValue(TOOL_ID, 'mode', 'local', state['mode']);
  },
};
