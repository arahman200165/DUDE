import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'yaml-path';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const yamlInput = readStorageValue<string>(TOOL_ID, 'yamlInput', 'session');
    const query = readStorageValue<string>(TOOL_ID, 'query', 'local') ?? '';
    const language = readStorageValue<string>(TOOL_ID, 'language', 'local') ?? 'jsonpath';
    const paneRatio = readStorageValue<number>(TOOL_ID, 'paneRatio', 'local') ?? 0.5;
    if (!yamlInput) return undefined;

    return { state: { yamlInput, query, language, paneRatio }, summary: `YAML query "${query}"` };
  },

  restore(state): void {
    if (typeof state['yamlInput'] === 'string') writeStorageValue(TOOL_ID, 'yamlInput', 'session', state['yamlInput']);
    if (typeof state['query'] === 'string') writeStorageValue(TOOL_ID, 'query', 'local', state['query']);
    if (typeof state['language'] === 'string') writeStorageValue(TOOL_ID, 'language', 'local', state['language']);
    if (typeof state['paneRatio'] === 'number') writeStorageValue(TOOL_ID, 'paneRatio', 'local', state['paneRatio']);
  },
};
