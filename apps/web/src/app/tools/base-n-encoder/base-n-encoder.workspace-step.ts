import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { BaseNMode } from "@dude/tool-engine/tools/base-n-encoder/base-n-codec";

const TOOL_ID = 'base-n-encoder';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    if (!input) return undefined;

    const direction = readStorageValue<'encode' | 'decode'>(TOOL_ID, 'direction', 'local') ?? 'encode';
    const mode = readStorageValue<BaseNMode>(TOOL_ID, 'mode', 'local') ?? 'base58';
    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return { state: { input, direction, mode }, summary: `${mode} ${direction}: "${preview}"` };
  },

  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (state['direction'] === 'encode' || state['direction'] === 'decode') writeStorageValue(TOOL_ID, 'direction', 'local', state['direction']);
    if (typeof state['mode'] === 'string') writeStorageValue(TOOL_ID, 'mode', 'local', state['mode']);
  },
};
