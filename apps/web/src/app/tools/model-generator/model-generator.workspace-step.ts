import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { ModelLanguage } from "@dude/tool-engine/tools/model-generator/model-generator-generate";

const TOOL_ID = 'model-generator';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    const rootName = readStorageValue<string>(TOOL_ID, 'rootName', 'local') ?? 'User';
    const language = readStorageValue<ModelLanguage>(TOOL_ID, 'language', 'local') ?? 'typescript';
    if (!input) return undefined;

    return { state: { input, rootName, language }, summary: `${language} model: ${rootName}` };
  },

  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (typeof state['rootName'] === 'string') writeStorageValue(TOOL_ID, 'rootName', 'local', state['rootName']);
    if (typeof state['language'] === 'string') writeStorageValue(TOOL_ID, 'language', 'local', state['language']);
  },
};
