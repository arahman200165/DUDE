import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'base64';

interface Base64State {
  readonly input: string;
  readonly mode: 'encode' | 'decode';
}

/**
 * Thin wrapper, mirrors how base64.ts itself calls
 * `persistence.signal('base64', 'input'|'mode', ...)` — reads/writes the exact same
 * `dude:v1:base64:<key>` storage keys, no coupling to a live component instance.
 */
export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    const mode = readStorageValue<Base64State['mode']>(TOOL_ID, 'mode', 'local') ?? 'encode';
    if (!input) return undefined;

    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return {
      state: { input, mode },
      summary: `${mode === 'encode' ? 'Encoding' : 'Decoding'} "${preview}"`,
    };
  },

  restore(state): void {
    if (typeof state['input'] === 'string') {
      writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    }
    if (state['mode'] === 'encode' || state['mode'] === 'decode') {
      writeStorageValue(TOOL_ID, 'mode', 'local', state['mode']);
    }
  },
};
