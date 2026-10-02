import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { type SqlParameterizerDialect, type SqlParamStyle } from "@dude/tool-engine/tools/sql-parameterizer/sql-parameterizer-logic";

const TOOL_ID = 'sql-parameterizer';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,
  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    if (!input) return undefined;
    const dialect = readStorageValue<SqlParameterizerDialect>(TOOL_ID, 'dialect', 'local') ?? 'postgresql';
    const style = readStorageValue<SqlParamStyle>(TOOL_ID, 'style', 'local') ?? 'question';
    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return { state: { input, dialect, style }, summary: `Parameterized SQL: "${preview}"` };
  },
  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (typeof state['dialect'] === 'string') writeStorageValue(TOOL_ID, 'dialect', 'local', state['dialect']);
    if (typeof state['style'] === 'string') writeStorageValue(TOOL_ID, 'style', 'local', state['style']);
  },
};
