import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { type SqlConverterDialect } from "@dude/tool-engine/tools/sql-dialect-converter/sql-dialect-converter-logic";

const TOOL_ID = 'sql-dialect-converter';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,
  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    if (!input) return undefined;
    const from = readStorageValue<SqlConverterDialect>(TOOL_ID, 'from', 'local') ?? 'mysql';
    const to = readStorageValue<SqlConverterDialect>(TOOL_ID, 'to', 'local') ?? 'postgresql';
    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return { state: { input, from, to }, summary: `SQL ${from}→${to}: "${preview}"` };
  },
  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (typeof state['from'] === 'string') writeStorageValue(TOOL_ID, 'from', 'local', state['from']);
    if (typeof state['to'] === 'string') writeStorageValue(TOOL_ID, 'to', 'local', state['to']);
  },
};
