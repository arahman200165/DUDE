import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'hex-dump';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const direction = readStorageValue<'toHexDump' | 'toFile'>(TOOL_ID, 'direction', 'local') ?? 'toHexDump';
    const dumpInput = readStorageValue<string>(TOOL_ID, 'dumpInput', 'session');
    const dumpOutput = readStorageValue<string>(TOOL_ID, 'dumpOutput', 'session');
    const filename = readStorageValue<string>(TOOL_ID, 'filename', 'local') ?? 'download.bin';
    const content = direction === 'toFile' ? dumpInput : dumpOutput;
    if (!content) return undefined;

    const preview = content.length > 40 ? `${content.slice(0, 40)}…` : content;
    return { state: { direction, dumpInput, dumpOutput, filename }, summary: `Hex dump (${direction}): "${preview}"` };
  },

  restore(state): void {
    if (state['direction'] === 'toHexDump' || state['direction'] === 'toFile') writeStorageValue(TOOL_ID, 'direction', 'local', state['direction']);
    if (typeof state['dumpInput'] === 'string') writeStorageValue(TOOL_ID, 'dumpInput', 'session', state['dumpInput']);
    if (typeof state['dumpOutput'] === 'string') writeStorageValue(TOOL_ID, 'dumpOutput', 'session', state['dumpOutput']);
    if (typeof state['filename'] === 'string') writeStorageValue(TOOL_ID, 'filename', 'local', state['filename']);
  },
};
