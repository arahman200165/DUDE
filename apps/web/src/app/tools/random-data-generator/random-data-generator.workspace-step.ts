import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'random-data-generator';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const selectedKeys = readStorageValue<readonly string[]>(TOOL_ID, 'selectedKeys', 'local');
    if (!selectedKeys || selectedKeys.length === 0) return undefined;

    const rowCount = readStorageValue<number>(TOOL_ID, 'rowCount', 'local') ?? 10;
    const seedInput = readStorageValue<string>(TOOL_ID, 'seedInput', 'local') ?? '';
    const outputView = readStorageValue<string>(TOOL_ID, 'outputView', 'local') ?? 'table';

    return {
      state: { selectedKeys, rowCount, seedInput, outputView },
      summary: `Mock data: ${selectedKeys.join(', ')}`,
    };
  },

  restore(state): void {
    if (Array.isArray(state['selectedKeys'])) writeStorageValue(TOOL_ID, 'selectedKeys', 'local', state['selectedKeys']);
    if (typeof state['rowCount'] === 'number') writeStorageValue(TOOL_ID, 'rowCount', 'local', state['rowCount']);
    if (typeof state['seedInput'] === 'string') writeStorageValue(TOOL_ID, 'seedInput', 'local', state['seedInput']);
    if (typeof state['outputView'] === 'string') writeStorageValue(TOOL_ID, 'outputView', 'local', state['outputView']);
  },
};
