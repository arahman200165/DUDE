import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'extract-columns';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    if (!input) return undefined;

    const delimiter = readStorageValue<string>(TOOL_ID, 'delimiter', 'local') ?? ',';
    const columnSpec = readStorageValue<string>(TOOL_ID, 'columnSpec', 'local') ?? '1';
    const outputDelimiter = readStorageValue<string>(TOOL_ID, 'outputDelimiter', 'local') ?? ',';
    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return { state: { input, delimiter, columnSpec, outputDelimiter }, summary: `Extract columns ${columnSpec}: "${preview}"` };
  },

  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (typeof state['delimiter'] === 'string') writeStorageValue(TOOL_ID, 'delimiter', 'local', state['delimiter']);
    if (typeof state['columnSpec'] === 'string') writeStorageValue(TOOL_ID, 'columnSpec', 'local', state['columnSpec']);
    if (typeof state['outputDelimiter'] === 'string') {
      writeStorageValue(TOOL_ID, 'outputDelimiter', 'local', state['outputDelimiter']);
    }
  },
};
