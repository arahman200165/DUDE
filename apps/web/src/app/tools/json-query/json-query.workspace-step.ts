import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { type QueryLanguage } from "@dude/tool-engine/tools/json-query/json-query-eval";

const TOOL_ID = 'json-query';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,
  snapshot(): WorkspaceSnapshot | undefined {
    const jsonInput = readStorageValue<string>(TOOL_ID, 'jsonInput', 'session');
    if (!jsonInput) return undefined;
    const query = readStorageValue<string>(TOOL_ID, 'query', 'local') ?? '';
    const language = readStorageValue<QueryLanguage>(TOOL_ID, 'language', 'local') ?? 'jsonpath';
    return { state: { jsonInput, query, language }, summary: `${language} query: "${query || '(none)'}"` };
  },
  restore(state): void {
    if (typeof state['jsonInput'] === 'string') writeStorageValue(TOOL_ID, 'jsonInput', 'session', state['jsonInput']);
    if (typeof state['query'] === 'string') writeStorageValue(TOOL_ID, 'query', 'local', state['query']);
    if (typeof state['language'] === 'string') writeStorageValue(TOOL_ID, 'language', 'local', state['language']);
  },
};
