import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import type { MockDataExportFormat } from "@dude/tool-engine/tools/mock-data-studio/mock-data-export";

const TOOL_ID = 'mock-data-studio';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const schema = readStorageValue<string>(TOOL_ID, 'schema', 'local');
    if (!schema) return undefined;

    const rowCount = readStorageValue<number>(TOOL_ID, 'rowCount', 'local') ?? 10;
    const seed = readStorageValue<string>(TOOL_ID, 'seed', 'local') ?? '';
    const tableName = readStorageValue<string>(TOOL_ID, 'tableName', 'local') ?? 'mock_data';
    const exportFormat = readStorageValue<MockDataExportFormat>(TOOL_ID, 'exportFormat', 'local') ?? 'json';

    return { state: { schema, rowCount, seed, tableName, exportFormat }, summary: `Mock data schema for "${tableName}"` };
  },

  restore(state): void {
    if (typeof state['schema'] === 'string') writeStorageValue(TOOL_ID, 'schema', 'local', state['schema']);
    if (typeof state['rowCount'] === 'number') writeStorageValue(TOOL_ID, 'rowCount', 'local', state['rowCount']);
    if (typeof state['seed'] === 'string') writeStorageValue(TOOL_ID, 'seed', 'local', state['seed']);
    if (typeof state['tableName'] === 'string') writeStorageValue(TOOL_ID, 'tableName', 'local', state['tableName']);
    if (typeof state['exportFormat'] === 'string') writeStorageValue(TOOL_ID, 'exportFormat', 'local', state['exportFormat']);
  },
};
