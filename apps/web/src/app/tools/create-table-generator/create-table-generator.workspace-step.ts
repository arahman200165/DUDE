import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { type CreateTableDialect } from "@dude/tool-engine/tools/create-table-generator/create-table-generator-logic";

const TOOL_ID = 'create-table-generator';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,
  snapshot(): WorkspaceSnapshot | undefined {
    const sample = readStorageValue<string>(TOOL_ID, 'sample', 'local');
    if (!sample) return undefined;
    const tableName = readStorageValue<string>(TOOL_ID, 'tableName', 'local') ?? 'users';
    const dialect = readStorageValue<CreateTableDialect>(TOOL_ID, 'dialect', 'local') ?? 'postgresql';
    const preview = sample.length > 40 ? `${sample.slice(0, 40)}…` : sample;
    return { state: { sample, tableName, dialect }, summary: `CREATE TABLE ${tableName}: "${preview}"` };
  },
  restore(state): void {
    if (typeof state['sample'] === 'string') writeStorageValue(TOOL_ID, 'sample', 'local', state['sample']);
    if (typeof state['tableName'] === 'string') writeStorageValue(TOOL_ID, 'tableName', 'local', state['tableName']);
    if (typeof state['dialect'] === 'string') writeStorageValue(TOOL_ID, 'dialect', 'local', state['dialect']);
  },
};
