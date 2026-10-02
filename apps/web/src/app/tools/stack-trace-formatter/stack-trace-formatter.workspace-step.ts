import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { StackTraceMode } from "@dude/tool-engine/tools/stack-trace-formatter/stack-trace-format";

const TOOL_ID = 'stack-trace-formatter';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    const mode = readStorageValue<StackTraceMode>(TOOL_ID, 'mode', 'local') ?? 'auto';
    const hideLibraryFrames = readStorageValue<boolean>(TOOL_ID, 'hideLibraryFrames', 'local') ?? false;
    if (!input) return undefined;

    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return { state: { input, mode, hideLibraryFrames }, summary: `Stack trace (${mode}): "${preview}"` };
  },

  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (typeof state['mode'] === 'string') writeStorageValue(TOOL_ID, 'mode', 'local', state['mode']);
    if (typeof state['hideLibraryFrames'] === 'boolean') {
      writeStorageValue(TOOL_ID, 'hideLibraryFrames', 'local', state['hideLibraryFrames']);
    }
  },
};
