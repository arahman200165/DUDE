import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'punycode-converter';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    if (!input) return undefined;

    const mode = readStorageValue<'convert' | 'inspect'>(TOOL_ID, 'mode', 'local') ?? 'convert';
    const direction = readStorageValue<'toASCII' | 'toUnicode'>(TOOL_ID, 'direction', 'local') ?? 'toASCII';
    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return { state: { input, mode, direction }, summary: `Punycode (${direction}): "${preview}"` };
  },

  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (state['mode'] === 'convert' || state['mode'] === 'inspect') writeStorageValue(TOOL_ID, 'mode', 'local', state['mode']);
    if (state['direction'] === 'toASCII' || state['direction'] === 'toUnicode') {
      writeStorageValue(TOOL_ID, 'direction', 'local', state['direction']);
    }
  },
};
