import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { type SqlDialect, type SqlFormatMode } from "@dude/tool-engine/tools/sql-formatter-tool/sql-formatter-logic";

const TOOL_ID = 'sql-formatter-tool';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,
  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    if (!input) return undefined;
    const dialect = readStorageValue<SqlDialect>(TOOL_ID, 'dialect', 'local') ?? 'sql';
    const mode = readStorageValue<SqlFormatMode>(TOOL_ID, 'mode', 'local') ?? 'format';
    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return { state: { input, dialect, mode }, summary: `SQL ${mode}: "${preview}"` };
  },
  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (typeof state['dialect'] === 'string') writeStorageValue(TOOL_ID, 'dialect', 'local', state['dialect']);
    if (typeof state['mode'] === 'string') writeStorageValue(TOOL_ID, 'mode', 'local', state['mode']);
  },
};
