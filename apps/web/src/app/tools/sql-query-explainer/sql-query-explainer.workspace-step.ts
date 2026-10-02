import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { type SqlExplainerDialect } from "@dude/tool-engine/tools/sql-query-explainer/sql-query-explainer-logic";

const TOOL_ID = 'sql-query-explainer';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,
  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    if (!input) return undefined;
    const dialect = readStorageValue<SqlExplainerDialect>(TOOL_ID, 'dialect', 'local') ?? 'postgresql';
    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return { state: { input, dialect }, summary: `SQL explain: "${preview}"` };
  },
  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (typeof state['dialect'] === 'string') writeStorageValue(TOOL_ID, 'dialect', 'local', state['dialect']);
  },
};
