import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { KeywordFrequencyOptions } from "@dude/tool-engine/tools/keyword-frequency-analyzer/keyword-frequency";

const TOOL_ID = 'keyword-frequency-analyzer';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    if (!input) return undefined;

    const options = readStorageValue<KeywordFrequencyOptions>(TOOL_ID, 'options', 'local');
    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return { state: { input, options }, summary: `Keyword frequency: "${preview}"` };
  },

  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (state['options']) writeStorageValue(TOOL_ID, 'options', 'local', state['options']);
  },
};
