import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'regex-generator';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const examplesRaw = readStorageValue<string>(TOOL_ID, 'examplesRaw', 'session');
    if (!examplesRaw) return undefined;

    const counterExamplesRaw = readStorageValue<string>(TOOL_ID, 'counterExamplesRaw', 'session') ?? '';
    const preview = examplesRaw.split('\n')[0]?.slice(0, 40) ?? '';
    return { state: { examplesRaw, counterExamplesRaw }, summary: `Regex from examples: "${preview}"` };
  },

  restore(state): void {
    if (typeof state['examplesRaw'] === 'string') writeStorageValue(TOOL_ID, 'examplesRaw', 'session', state['examplesRaw']);
    if (typeof state['counterExamplesRaw'] === 'string') {
      writeStorageValue(TOOL_ID, 'counterExamplesRaw', 'session', state['counterExamplesRaw']);
    }
  },
};
