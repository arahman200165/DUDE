import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { HtmlEntityMode } from "@dude/tool-engine/tools/html-entities/html-entity-codec";

const TOOL_ID = 'html-entities';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    if (!input) return undefined;

    const mode = readStorageValue<HtmlEntityMode>(TOOL_ID, 'mode', 'local') ?? 'encode';
    const encodeAllNonAscii = readStorageValue<boolean>(TOOL_ID, 'encodeAllNonAscii', 'local') ?? false;
    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return { state: { input, mode, encodeAllNonAscii }, summary: `${mode === 'encode' ? 'Encoding' : 'Decoding'} "${preview}"` };
  },

  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (state['mode'] === 'encode' || state['mode'] === 'decode') writeStorageValue(TOOL_ID, 'mode', 'local', state['mode']);
    if (typeof state['encodeAllNonAscii'] === 'boolean') writeStorageValue(TOOL_ID, 'encodeAllNonAscii', 'local', state['encodeAllNonAscii']);
  },
};
