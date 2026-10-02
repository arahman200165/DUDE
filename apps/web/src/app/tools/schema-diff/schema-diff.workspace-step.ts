import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { type SchemaDiffDialect } from "@dude/tool-engine/tools/schema-diff/schema-diff-logic";

const TOOL_ID = 'schema-diff';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,
  snapshot(): WorkspaceSnapshot | undefined {
    const before = readStorageValue<string>(TOOL_ID, 'before', 'session');
    const after = readStorageValue<string>(TOOL_ID, 'after', 'session');
    if (!before && !after) return undefined;
    const dialect = readStorageValue<SchemaDiffDialect>(TOOL_ID, 'dialect', 'local') ?? 'postgresql';
    return { state: { before: before ?? '', after: after ?? '', dialect }, summary: 'Schema diff' };
  },
  restore(state): void {
    if (typeof state['before'] === 'string') writeStorageValue(TOOL_ID, 'before', 'session', state['before']);
    if (typeof state['after'] === 'string') writeStorageValue(TOOL_ID, 'after', 'session', state['after']);
    if (typeof state['dialect'] === 'string') writeStorageValue(TOOL_ID, 'dialect', 'local', state['dialect']);
  },
};
