import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'regex-benchmark';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const pattern = readStorageValue<string>(TOOL_ID, 'pattern', 'session');
    if (!pattern) return undefined;

    const flags = readStorageValue<string>(TOOL_ID, 'flags', 'session') ?? '';
    const samplesRaw = readStorageValue<string>(TOOL_ID, 'samplesRaw', 'session') ?? '';
    const timeoutMs = readStorageValue<number>(TOOL_ID, 'timeoutMs', 'local') ?? 1000;

    return { state: { pattern, flags, samplesRaw, timeoutMs }, summary: `Benchmarked /${pattern}/${flags}` };
  },

  restore(state): void {
    if (typeof state['pattern'] === 'string') writeStorageValue(TOOL_ID, 'pattern', 'session', state['pattern']);
    if (typeof state['flags'] === 'string') writeStorageValue(TOOL_ID, 'flags', 'session', state['flags']);
    if (typeof state['samplesRaw'] === 'string') writeStorageValue(TOOL_ID, 'samplesRaw', 'session', state['samplesRaw']);
    if (typeof state['timeoutMs'] === 'number') writeStorageValue(TOOL_ID, 'timeoutMs', 'local', state['timeoutMs']);
  },
};
