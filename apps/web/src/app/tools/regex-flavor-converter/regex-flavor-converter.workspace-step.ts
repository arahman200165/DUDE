import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import type { ConverterFlavor } from "@dude/tool-engine/tools/regex-flavor-converter/regex-flavor-convert";

const TOOL_ID = 'regex-flavor-converter';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const pattern = readStorageValue<string>(TOOL_ID, 'pattern', 'session');
    if (!pattern) return undefined;

    const flags = readStorageValue<string>(TOOL_ID, 'flags', 'session') ?? '';
    const source = readStorageValue<ConverterFlavor>(TOOL_ID, 'source', 'local') ?? 'js';
    const target = readStorageValue<ConverterFlavor>(TOOL_ID, 'target', 'local') ?? 'python';

    return { state: { pattern, flags, source, target }, summary: `${source} → ${target}: /${pattern}/` };
  },

  restore(state): void {
    if (typeof state['pattern'] === 'string') writeStorageValue(TOOL_ID, 'pattern', 'session', state['pattern']);
    if (typeof state['flags'] === 'string') writeStorageValue(TOOL_ID, 'flags', 'session', state['flags']);
    if (typeof state['source'] === 'string') writeStorageValue(TOOL_ID, 'source', 'local', state['source']);
    if (typeof state['target'] === 'string') writeStorageValue(TOOL_ID, 'target', 'local', state['target']);
  },
};
