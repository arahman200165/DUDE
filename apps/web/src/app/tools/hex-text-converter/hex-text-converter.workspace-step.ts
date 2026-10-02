import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { HexTextDirection, HexTextEncoding } from "@dude/tool-engine/tools/hex-text-converter/hex-text-convert";

const TOOL_ID = 'hex-text-converter';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    if (!input) return undefined;

    const direction = readStorageValue<HexTextDirection>(TOOL_ID, 'direction', 'local') ?? 'toHex';
    const encoding = readStorageValue<HexTextEncoding>(TOOL_ID, 'encoding', 'local') ?? 'utf8';
    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return { state: { input, direction, encoding }, summary: `${direction === 'toHex' ? 'To hex' : 'To text'}: "${preview}"` };
  },

  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (state['direction'] === 'toHex' || state['direction'] === 'toText') writeStorageValue(TOOL_ID, 'direction', 'local', state['direction']);
    if (typeof state['encoding'] === 'string') writeStorageValue(TOOL_ID, 'encoding', 'local', state['encoding']);
  },
};
