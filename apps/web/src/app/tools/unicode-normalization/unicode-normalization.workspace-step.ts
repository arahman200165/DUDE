import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { NormalizationForm } from "@dude/tool-engine/tools/unicode-normalization/unicode-normalize";

const TOOL_ID = 'unicode-normalization';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    if (!input) return undefined;

    const form = readStorageValue<NormalizationForm>(TOOL_ID, 'form', 'local') ?? 'NFC';
    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return { state: { input, form }, summary: `${form} normalize: "${preview}"` };
  },

  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (typeof state['form'] === 'string') writeStorageValue(TOOL_ID, 'form', 'local', state['form']);
  },
};
